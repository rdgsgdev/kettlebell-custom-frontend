import { WorkoutTemplate } from '../models';

export const DEFAULT_TEMPLATE: WorkoutTemplate = {
  id: 'default-kb-classic',
  name: 'KB Classic',
  blocks: [
    {
      id: 'block-starter',
      type: 'starter',
      items: [
        {
          id: 'si-halo',
          exerciseName: 'Halo',
          repMode: 'bilateral',
          reps: 10,
          sets: 1,
          weight: 12,
          restTime: 60,
        },
      ],
    },
    {
      id: 'block-emom',
      type: 'emom',
      emomMinutes: 20,
      items: [
        {
          id: 'ei-snatch',
          exerciseName: 'Snatch',
          repMode: 'unilateral',
          reps: 8,
          weight: 24,
          restTime: 0,
        },
        {
          id: 'ei-pushups',
          exerciseName: 'Push-ups',
          repMode: 'bilateral',
          reps: 10,
          weight: 0,
          restTime: 0,
        },
        {
          id: 'ei-thruster',
          exerciseName: 'Thruster',
          repMode: 'unilateral',
          reps: 6,
          weight: 20,
          restTime: 0,
        },
        {
          id: 'ei-row',
          exerciseName: 'Row',
          repMode: 'unilateral',
          reps: 8,
          weight: 24,
          restTime: 0,
        },
      ],
    },
    {
      id: 'block-finisher',
      type: 'finisher',
      items: [
        {
          id: 'fi-swings',
          exerciseName: 'Swings',
          repMode: 'bilateral',
          reps: 20,
          sets: 1,
          weight: 32,
          restTime: 60,
        },
      ],
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
