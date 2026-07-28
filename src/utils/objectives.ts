// ─────────────────────────────────────────────────────────────────────────────
// Objectives engine — pure functions that turn a user's history + profile into
// measurable progress for each Objective.
//
// A metric TYPE describes *how* to measure something. An Objective is an
// *instance* of a type with a target (and, for rep/weight metrics, an exercise).
// To support a brand-new kind of measurement, add an entry to OBJECTIVE_METRICS
// below — everything else (UI, persistence, progress) is type-driven.
// ─────────────────────────────────────────────────────────────────────────────

import { ItemLog, Objective, ObjectiveMetricType, UserProfile, WorkoutLog } from '../models';
import { DEFAULT_PROFILE } from '../models';

/**
 * Unilateral-aware rep count for a logged set. Unilateral items split reps
 * across left/right; bilateral (and legacy items) use `reps` directly.
 * Canonical copy — also exists inline in HistoryScreen/contextBuilder.
 */
export function itemReps(i: ItemLog): number {
  if (i.repMode !== 'bilateral' && i.repsLeft != null) {
    const left = i.repsLeft || 0;
    const right = i.repsRight ?? i.repsLeft ?? 0;
    return left + right;
  }
  return i.reps;
}

/** A set that actually counts toward a record. */
function counts(i: ItemLog): boolean {
  return i.completed && !i.skipped;
}

export interface ObjectiveEvalContext {
  logs: WorkoutLog[];
  profile: UserProfile;
}

export interface MetricDef {
  type: ObjectiveMetricType;
  /** Short label, e.g. "Max reps". */
  label: string;
  /** Unit suffix shown after values, e.g. "reps", "kg", "%". */
  unit: string;
  /** Ionicons name used as the row icon. */
  icon: string;
  /** True for "lower is better" goals (e.g. body fat under X%). */
  lowerIsBetter: boolean;
  /** Current value for this metric, given the user's history/profile. */
  evaluate: (objective: Objective, ctx: ObjectiveEvalContext) => number;
}

/**
 * Registry of all supported metric types. Drives the Add form, the row icons,
 * and the progress math. Adding a metric here makes it available everywhere.
 */
export const OBJECTIVE_METRICS: Record<ObjectiveMetricType, MetricDef> = {
  max_reps: {
    type: 'max_reps',
    label: 'Max reps',
    unit: 'reps',
    icon: 'repeat-outline',
    lowerIsBetter: false,
    evaluate: (objective, { logs }) => {
      const name = objective.exerciseName;
      if (!name) return 0;
      let max = 0;
      for (const log of logs) {
        for (const i of log.itemLogs) {
          if (counts(i) && i.exerciseName === name) {
            max = Math.max(max, itemReps(i));
          }
        }
      }
      return max;
    },
  },
  max_weight: {
    type: 'max_weight',
    label: 'Heaviest weight',
    unit: 'kg',
    icon: 'barbell-outline',
    lowerIsBetter: false,
    evaluate: (objective, { logs }) => {
      const name = objective.exerciseName; // optional scope
      let max = 0;
      for (const log of logs) {
        for (const i of log.itemLogs) {
          if (counts(i) && i.weight > 0 && (!name || i.exerciseName === name)) {
            max = Math.max(max, i.weight);
          }
        }
      }
      return max;
    },
  },
  body_fat: {
    type: 'body_fat',
    label: 'Body fat',
    unit: '%',
    icon: 'body-outline',
    lowerIsBetter: true,
    evaluate: (_objective, { profile }) => profile.bodyFatPct ?? 0,
  },
};

export const ALL_METRIC_TYPES = Object.keys(OBJECTIVE_METRICS) as ObjectiveMetricType[];

/**
 * Ensure a loaded profile has the `objectives` field. For users upgrading from
 * a version before measurable objectives existed, backfill the default seed
 * objectives exactly once (when `objectives` is absent). Returns the (possibly
 * patched) profile so the caller can persist the migration.
 */
export function normalizeProfile(profile: Partial<UserProfile> | undefined): UserProfile {
  const base: UserProfile = {
    ...DEFAULT_PROFILE,
    ...profile,
    goals: profile?.goals ?? [],
  };
  if (!base.objectives) {
    base.objectives = DEFAULT_PROFILE.objectives.map((o) => ({ ...o }));
  }
  return base;
}

export function getMetric(type: ObjectiveMetricType): MetricDef {
  return OBJECTIVE_METRICS[type];
}

export interface ObjectiveProgress {
  current: number;
  target: number;
  /** 0..1 progress fraction (clamped). */
  pct: number;
  done: boolean;
}

/**
 * Compute progress for an objective.
 *
 * - "Higher is better" metrics (max_reps, max_weight): pct = current / target.
 * - "Lower is better" metrics (body_fat): we treat reaching *under* the target
 *   as completion. With no data, pct = 0 (nothing achieved). Once a value is
 *   recorded, progress scales from 0 at "double the target" to 1 at the target.
 */
export function computeProgress(objective: Objective, ctx: ObjectiveEvalContext): ObjectiveProgress {
  const metric = OBJECTIVE_METRICS[objective.metricType];
  const current = metric.evaluate(objective, ctx);
  const target = objective.target;

  let pct: number;
  if (metric.lowerIsBetter) {
    if (!current) pct = 0;
    else if (current <= target) pct = 1;
    else pct = Math.max(0, (2 * target - current) / target);
  } else {
    pct = target > 0 ? current / target : 0;
  }
  pct = Math.max(0, Math.min(1, pct));
  return { current, target, pct, done: pct >= 1 };
}

// ─── Display helpers (shared by ObjectiveCard + AddObjectiveModal) ────────────

/** Human-readable title for an objective row, e.g. "Pull-up" or "Body fat". */
export function objectiveTitle(objective: Objective): string {
  if (objective.exerciseName) return objective.exerciseName;
  return OBJECTIVE_METRICS[objective.metricType].label;
}

/** "Perform 20 reps", "Heaviest weight under 24 kg", "Body fat under 10 %". */
export function objectiveSubtitle(objective: Objective): string {
  const metric = OBJECTIVE_METRICS[objective.metricType];
  const verb = objective.metricType === 'body_fat' ? 'under' : objective.metricType === 'max_weight' ? 'lift' : 'reach';
  return `${metric.label}: ${verb} ${objective.target} ${metric.unit}`.trim();
}

/** Format a measured value with its unit, e.g. "12 reps", "— kg". */
export function formatCurrentValue(value: number, metricType: ObjectiveMetricType): string {
  const unit = OBJECTIVE_METRICS[metricType].unit;
  if (!value) return `— ${unit}`;
  // Drop trailing .0 for clean numbers (e.g. 24.0 kg → 24 kg).
  const display = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${display} ${unit}`;
}
