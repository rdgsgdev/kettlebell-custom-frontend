// ─────────────────────────────────────────────────────────────────────────────
// Canonical data model for KBC – Kettlebell Coach.
// Source of truth for both the Supabase backend and the React Native frontend.
// The frontend copies this file into its own src/models/ for type parity.
// ─────────────────────────────────────────────────────────────────────────────

export type RepMode = 'bilateral' | 'unilateral' | 'unilateral-fr';
export type BlockType = 'starter' | 'emom' | 'finisher' | 'mobility' | 'stretching' | 'juarez';
export type ExecutionType = 'reps' | 'countdown' | 'countup';

// ─── Settings & Profile ───────────────────────────────────────────────────────

export interface CustomBlockDef {
  id: string;
  label: string;
  color: string;
  baseType: 'standard' | 'emom' | 'juarez';
  // standard = sets/reps/rest; emom = interval; juarez = Juarez Valley pyramid
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  /**
   * Kept for backward compatibility with the legacy on-device export.
   * NOT persisted in Supabase — the Perplexity key is a server-side Edge
   * Function secret only.
   */
  perplexityApiKey?: string;
  customBlockDefs: CustomBlockDef[];
}

// ─── Objectives (measurable goals) ────────────────────────────────────────────
//
// An Objective is an *instance* of a supported metric type. New instances of
// the existing types can be created in-app (Add Objective form); adding a
// brand-new metric type requires extending OBJECTIVE_METRICS in utils/objectives.ts.

export type ObjectiveMetricType = 'max_reps' | 'max_weight' | 'body_fat';

export interface Objective {
  id: string;
  metricType: ObjectiveMetricType;
  /** Target value to reach: reps (max_reps), kg (max_weight), or % (body_fat). */
  target: number;
  /** Required for max_reps; optional scope for max_weight. Free-form name from
   *  the exercise library (matched against ItemLog.exerciseName). */
  exerciseName?: string;
  createdAt: string; // ISO
}

export interface UserProfile {
  name: string;
  weightKg?: number;
  heightCm?: number;
  birthYear?: number;
  bodyFatPct?: number;
  /** ISO timestamp of the most recent Apple Health weight sample applied. Lets
   *  the auto-fetch decide whether a new Health reading is newer than the
   *  value currently stored, so manual edits aren't clobbered. Written only
   *  by the Health sync path, never by the manual text-input path. */
  weightKgUpdatedAt?: string;
  /** ISO timestamp of the most recent Apple Health body fat sample applied. */
  bodyFatPctUpdatedAt?: string;
  /** Legacy simple goal tags — still read by the AI coach context + Supabase sync.
   *  Kept for backward compatibility; the UI now uses `objectives` instead. */
  goals: string[];
  objectives: Objective[];
}

export const DEFAULT_BLOCK_DEFS: CustomBlockDef[] = [
  { id: 'cbd-warmup', label: 'Warm-up', color: '#60A5FA', baseType: 'standard' },
  { id: 'cbd-main', label: 'Main', color: '#FF6B35', baseType: 'standard' },
  { id: 'cbd-finisher', label: 'Finisher', color: '#A78BFA', baseType: 'standard' },
  { id: 'cbd-emom', label: 'EMOM', color: '#FBBF24', baseType: 'emom' },
  { id: 'cbd-juarez', label: 'Juarez Valley', color: '#2DD4BF', baseType: 'juarez' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  customBlockDefs: DEFAULT_BLOCK_DEFS,
};

export const DEFAULT_PROFILE: UserProfile = {
  name: '',
  goals: [],
  objectives: [
    {
      id: 'seed-pullups-20',
      metricType: 'max_reps',
      target: 20,
      exerciseName: 'Pull-up',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'seed-bodyfat-10',
      metricType: 'body_fat',
      target: 10,
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'seed-kettlebell-24',
      metricType: 'max_weight',
      target: 24,
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ],
};

// ─── Exercise Library ─────────────────────────────────────────────────────────

export type ExerciseCategory = 'strength' | 'cardio' | 'flexibility' | 'balance';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves'
  | 'traps'
  | 'lats'
  | 'hip_flexors'
  | 'neck'
  | 'full_body';

export interface TargetedMuscle {
  group: MuscleGroup;
  isPrimary: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  repMode: RepMode;
  category: ExerciseCategory;
  muscles: TargetedMuscle[];
  description?: string;
  videoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Workout Templates ────────────────────────────────────────────────────────

export interface WorkoutItem {
  id: string;
  exerciseName: string;
  repMode: RepMode;
  reps: number;
  sets?: number;
  durationSeconds?: number;    // countdown target only; countup has no preset target
  executionType?: ExecutionType; // 'reps' | 'countdown' | 'countup'. undefined → derived (see getExecutionType)
  weight: number;
  restTime: number;
}

export interface WorkoutBlock {
  id: string;
  type: BlockType;
  items: WorkoutItem[];
  emomMinutes?: number;      // only for type === 'emom'
  juarezStartingReps?: number; // only for type === 'juarez' — the starting rep count N
  juarezSuperset?: boolean;    // only for type === 'juarez' — true = 2 exercises alternate
  customBlockDefId?: string; // ID of CustomBlockDef used to create this block
  customLabel?: string;      // display label override
  customColor?: string;      // display color override
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  blocks: WorkoutBlock[];
  createdAt: string;
  updatedAt: string;
  alarmMinutes?: number; // if set, an alarm fires this many minutes after workout start
  archived?: boolean; // if true, the template is deactivated and shown in a collapsible section
}

// ─── Workout Logs (history) ───────────────────────────────────────────────────

export interface ItemLog {
  id: string;
  blockId?: string;        // ID of the source WorkoutBlock — groups items per block in history
  blockType: BlockType;
  customLabel?: string;    // custom block display label override
  customColor?: string;    // custom block display color override
  exerciseName: string;
  reps: number;
  repsLeft?: number;  // unilateral only
  repsRight?: number; // unilateral only
  weight: number;
  repMode: RepMode;
  completed: boolean;
  skipped?: boolean;
  emomMinute?: number; // only for EMOM items
  juarezRound?: number; // only for Juarez Valley items — 1-indexed round number
  setNumber?: number; // only for multi-set standard items — 1-indexed set number
  durationSeconds?: number; // performed seconds for countdown/countup holds
}

export interface WorkoutLog {
  id: string;
  templateId: string;
  workoutName: string;
  startedAt: string;
  endedAt: string;
  totalDurationSeconds: number;
  note: string;
  isPartial: boolean;
  itemLogs: ItemLog[];
}

// ─── Export / Import payload ──────────────────────────────────────────────────

export interface KBCExportPayload {
  version: 1;
  app: 'kbc';
  exportedAt: string;
  data: {
    settings: Omit<AppSettings, 'perplexityApiKey'>;
    profile: UserProfile;
    exercises: Exercise[];
    templates: WorkoutTemplate[];
    logs: WorkoutLog[];
    activeWorkoutIds?: string[];
  };
}
