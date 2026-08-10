// health.ts — thin, platform-aware wrapper around react-native-health (Apple
// HealthKit) for reading body composition metrics.
//
// ⚠️ CRASH SAFETY: calling the native HealthKit module on a device whose app is
// not entitled to HealthKit (no `com.apple.developer.healthkit` entitlement)
// causes iOS to TERMINATE the app. This is a native kill — no JS try/catch can
// intercept it. Therefore EVERY native call is gated behind `isHealthEnabled`,
// which is opt-in: it starts false and is only turned on by an explicit user
// action (tapping the Sync button). The auto-fetch-on-focus path never enables
// it, so merely opening the Profile screen touches HealthKit zero times.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
// Type-only imports: erased by the compiler, never evaluated at runtime.
import type AppleHealthKitDefault from 'react-native-health';
import type { HealthKitPermissions } from 'react-native-health';

type AppleHealthKit = typeof AppleHealthKitDefault;

const isIOS = Platform.OS === 'ios';

/**
 * Master switch. Off until the user explicitly opts in by tapping Sync. This is
 * what makes the screen safe to open on a device without the HealthKit
 * entitlement — no native call is ever made while it's false.
 */
let enabled = false;
let nativeAvailable: boolean | null = null;

/**
 * Opt into Health. Resolves false (and stays opted-out) if the native module
 * can't even be resolved, so a device without the module linked won't crash.
 * Safe to call repeatedly. Only call this from a deliberate user action.
 */
export async function enableHealth(): Promise<boolean> {
  // Defense-in-depth: even if this is somehow reached, the build flag is the
  // hard gate that prevents a native call on an entitlement-less build.
  if (!isHealthAvailable()) {
    enabled = false;
    return false;
  }
  nativeAvailable = true;
  enabled = true;
  return true;
}

/** Whether Health is currently opted in for reads (i.e. safe to call native). */
export function isHealthEnabled(): boolean {
  return enabled;
}

let _kit: AppleHealthKit | null = null;
/**
 * Lazily resolve the native module. Returns null on non-iOS platforms or if the
 * module isn't linked. This only RESOLVES the JS object — it does NOT call any
 * native method, so it's safe even without the entitlement.
 */
function kit(): AppleHealthKit | null {
  if (!isIOS) return null;
  if (!_kit) {
    try {
      // Dynamic require keeps the module out of the web/Android eval path.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      _kit = require('react-native-health');
    } catch {
      _kit = null;
    }
  }
  return _kit;
}

let authorized = false;

/**
 * Request HealthKit read access for BodyMass + BodyFatPercentage. Idempotent.
 * MUST only be called while `enabled` is true (i.e. after enableHealth()).
 * Resolves false on any failure — never throws.
 */
async function initHealthKit(): Promise<boolean> {
  if (!enabled) return false;
  const k = kit();
  if (!k) return false;
  if (authorized) return true;

  return new Promise<boolean>((resolve) => {
    try {
      const Permissions = (k as any).Constants?.Permissions ?? {};
      const read = [Permissions.BodyMass, Permissions.BodyFatPercentage].filter(Boolean);
      if (read.length === 0) {
        resolve(false);
        return;
      }
      const permissions = {
        permissions: { read, write: [] },
      } as HealthKitPermissions;

      (k as any).initHealthKit(permissions, (err: string) => {
        if (err) {
          authorized = false;
          resolve(false);
          return;
        }
        authorized = true;
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

export interface LatestWeight {
  value: number; // kg
  date: string; // ISO
}

export interface LatestBodyFat {
  value: number; // %
  date: string; // ISO
}

export interface BodyMetrics {
  weightKg?: number;
  weightDate?: string;
  bodyFatPct?: number;
  bodyFatDate?: string;
}

function healthValueToNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

/** Most recent body weight in kg, or null if unavailable / not opted in. */
export async function getLatestWeightKg(): Promise<LatestWeight | null> {
  if (!enabled) return null;
  const ok = await initHealthKit();
  const k = kit();
  if (!ok || !k) return null;
  return new Promise<LatestWeight | null>((resolve) => {
    try {
      (k as any).getLatestWeight({ unit: 'gram' }, (err: string, res: { value: number; startDate: string }) => {
        if (err || !res) {
          resolve(null);
          return;
        }
        const grams = healthValueToNumber(res.value);
        if (grams == null) {
          resolve(null);
          return;
        }
        resolve({ value: grams / 1000, date: res.startDate });
      });
    } catch {
      resolve(null);
    }
  });
}

/** Most recent body fat percentage (0–100), or null if unavailable / not opted in. */
export async function getLatestBodyFatPct(): Promise<LatestBodyFat | null> {
  if (!enabled) return null;
  const ok = await initHealthKit();
  const k = kit();
  if (!ok || !k) return null;
  return new Promise<LatestBodyFat | null>((resolve) => {
    try {
      (k as any).getLatestBodyFatPercentage(
        {},
        (err: string, res: { value: number; startDate: string }) => {
          if (err || !res) {
            resolve(null);
            return;
          }
          const pct = healthValueToNumber(res.value);
          if (pct == null) {
            resolve(null);
            return;
          }
          // HealthKit stores body fat as a fraction (0..1); normalize to %.
          const value = pct <= 1 ? pct * 100 : pct;
          resolve({ value, date: res.startDate });
        },
      );
    } catch {
      resolve(null);
    }
  });
}

/** Fetch the latest weight + body fat in one call. Missing readings are simply
 *  omitted from the result. Never throws. Returns empty when not opted in. */
export async function getLatestBodyMetrics(): Promise<BodyMetrics> {
  if (!enabled) return {};
  const [weight, bodyFat] = await Promise.all([
    getLatestWeightKg(),
    getLatestBodyFatPct(),
  ]);
  const result: BodyMetrics = {};
  if (weight) {
    result.weightKg = round(weight.value, 1);
    result.weightDate = weight.date;
  }
  if (bodyFat) {
    result.bodyFatPct = round(bodyFat.value, 1);
    result.bodyFatDate = bodyFat.date;
  }
  return result;
}

/**
 * Whether the Health UI affordances should be SHOWN at all. Requires ALL of:
 *  - iOS (HealthKit is iOS-only)
 *  - the native module to be linked
 *  - the build flag `extra.healthKitEnabled` to be true (set via
 *    EXPO_PUBLIC_HEALTH_KIT_ENABLED). This flag is the hard gate that prevents
 *    a crash on builds that link the module but lack the HealthKit entitlement.
 *
 * When this returns false, the Sync button isn't rendered and no native call is
 * ever made — so a build without the entitlement is completely safe.
 */
export function isHealthAvailable(): boolean {
  if (!isIOS) return false;
  const flagEnabled = Constants.expoConfig?.extra?.healthKitEnabled === true;
  if (!flagEnabled) return false;
  // Resolve once and cache; kit() is cheap and never calls native.
  if (nativeAvailable === null) nativeAvailable = !!kit();
  return nativeAvailable;
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
