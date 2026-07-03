import { ExerciseCategory, MuscleGroup } from '../models';

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  flexibility: 'Flexibility',
  balance: 'Balance',
};

export const CATEGORY_COLORS: Record<ExerciseCategory, string> = {
  strength: '#60A5FA',
  cardio: '#FBBF24',
  flexibility: '#F472B6',
  balance: '#2DD4BF',
};

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  core: 'Core',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  traps: 'Traps',
  lats: 'Lats',
  hip_flexors: 'Hip Flexors',
  neck: 'Neck',
  full_body: 'Full Body',
};

// Front-body muscle groups (used for layout ordering)
export const FRONT_MUSCLES: MuscleGroup[] = [
  'neck', 'chest', 'shoulders', 'biceps', 'forearms', 'core', 'hip_flexors', 'quads', 'calves',
];

export const BACK_MUSCLES: MuscleGroup[] = [
  'traps', 'lats', 'back', 'triceps', 'glutes', 'hamstrings', 'calves',
];

export const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'core', 'glutes', 'quads', 'hamstrings', 'calves',
  'traps', 'lats', 'hip_flexors', 'neck', 'full_body',
];
