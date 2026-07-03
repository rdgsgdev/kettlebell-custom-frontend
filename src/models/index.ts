// ─────────────────────────────────────────────────────────────────────────────
// Canonical data model for KBC – Kettlebell Coach.
// Source of truth for both the Supabase backend and the React Native frontend.
// The frontend copies this file into its own src/models/ for type parity.
// ─────────────────────────────────────────────────────────────────────────────

export type RepMode = 'bilateral' | 'unilateral' | 'unilateral-fr';
export type BlockType = 'starter' | 'emom' | 'finisher' | 'mobility' | 'stretching';

// ─── Settings & Profile ───────────────────────────────────────────────────────

export interface CustomBlockDef {
  id: string;
  label: string;
  color: string;
  baseType: 'standard' | 'emom'; // standard = sets/reps/rest; emom = interval
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

export interface UserProfile {
  name: string;
  weightKg?: number;
  heightCm?: number;
  birthYear?: number;
  goals: string[];
}

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
  durationSeconds?: number;
  weight: number;
  restTime: number;
}

export interface WorkoutBlock {
  id: string;
  type: BlockType;
  items: WorkoutItem[];
  emomMinutes?: number;      // only for type === 'emom'
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
