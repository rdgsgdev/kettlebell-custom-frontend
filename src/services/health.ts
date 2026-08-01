// health.ts — thin, platform-aware wrapper around react-native-health (Apple
// HealthKit) for reading body composition metrics.
//
// HealthKit is iOS-only. On Android and web every function here resolves to a
// safe no-op (null / false) so the Profile screen can call them unconditionally.
//
// The native module is loaded lazily (require() inside an iOS-only branch) so it
// is never evaluated in the web bundle — react-native-health references
// NativeModules['RNAppleHealthKit'] at module scope, which would throw in a
// browser. We import only the *types* statically (type-only imports are erased
// at compile time and never reach the runtime).

import { Platform } from 'react-native';
// Type-only imports: erased by the compiler, never evaluated at runtime.
import type AppleHealthKitDefault from 'react-native-health';
import type { HealthKitPermissions } from 'react-native-health';

type AppleHealthKit = typeof AppleHealthKitDefault;

const isIOS = Platform.OS === 'ios';

let _kit: AppleHealthKit | null = null;
/**
 * Lazily resolve the native module. Returns null on non-iOS platforms or if the
 * module isn't linked (e.g. running in a simulator without native deps).
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

/** Request HealthKit read access for BodyMass + BodyFatPercentage. Idempotent.
 *  Resolves false on non-iOS, if the module is missing, or if the user denies. */
export async function initHealthKit(): Promise<boolean> {
  const k = kit();
  if (!k) return false;
  if (authorized) return true;

  return new Promise<boolean>((resolve) => {
    try {
      const Permissions = (k as any).Constants?.Permissions ?? {};
      const permissions = {
        permissions: {
          read: [Permissions.BodyMass, Permissions.BodyFatPercentage].filter(Boolean),
          write: [],
        },
      } as HealthKitPermissions;

      (k as any).initHealthKit(permissions, (err: string) => {
        if (err) {
          // Permission denied or HealthKit unavailable (e.g. iPad). Fail soft.
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

/** Most recent body weight in kg, or null if unavailable. */
export async function getLatestWeightKg(): Promise<LatestWeight | null> {
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

/** Most recent body fat percentage (0–100), or null if unavailable. */
export async function getLatestBodyFatPct(): Promise<LatestBodyFat | null> {
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
 *  omitted from the result. Never throws. */
export async function getLatestBodyMetrics(): Promise<BodyMetrics> {
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

/** True when running on a device/platform that supports Apple Health. The UI
 *  uses this to decide whether to show the "pull from Health" affordances. */
export function isHealthAvailable(): boolean {
  return isIOS;
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
