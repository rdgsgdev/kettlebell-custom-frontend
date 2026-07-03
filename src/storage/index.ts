// storage/index.ts — facade preserving the original AsyncStorage API surface
// so AppContext / SettingsContext continue to call the same function names.
//
// Under the hood every save is write-through: local SQLite first (instant UI +
// offline), then queued for a push to Supabase. Reads come from the cache.

import {
  WorkoutTemplate,
  WorkoutLog,
  Exercise,
  AppSettings,
  UserProfile,
} from '../models';
import {
  dbLoadExercises,
  dbLoadTemplates,
  dbLoadLogs,
  dbLoadSettings,
  dbLoadProfile,
  dbGetActiveWorkoutIds,
  dbPersistActiveWorkoutIds,
  dbUpsertExercise,
  dbUpsertTemplate,
  dbUpsertLog,
  dbDeleteExercise,
  dbDeleteTemplate,
  dbDeleteLog,
  dbSaveSettings,
  dbSaveProfile,
} from './db';
import { pushDirty, pullAll } from './sync';

export { pullAll };

// ── Templates ────────────────────────────────────────────────────────────────
export async function loadTemplates(): Promise<WorkoutTemplate[]> {
  return dbLoadTemplates();
}

export async function saveTemplates(templates: WorkoutTemplate[]): Promise<void> {
  // Replace-all semantics: the context passes the full list. We persist each
  // and remove any local template no longer present.
  const current = await dbLoadTemplates();
  const ids = new Set(templates.map((t) => t.id));
  for (const t of templates) await dbUpsertTemplate(t, true);
  for (const t of current) if (!ids.has(t.id)) await dbDeleteTemplate(t.id);
  pushDirty().catch(() => {});
}

// ── Logs ─────────────────────────────────────────────────────────────────────
export async function loadLogs(): Promise<WorkoutLog[]> {
  return dbLoadLogs();
}

export async function saveLogs(logs: WorkoutLog[]): Promise<void> {
  const current = await dbLoadLogs();
  const ids = new Set(logs.map((l) => l.id));
  for (const l of logs) await dbUpsertLog(l, true);
  for (const l of current) if (!ids.has(l.id)) await dbDeleteLog(l.id, true);
  pushDirty().catch(() => {});
}

// ── Active workout IDs ───────────────────────────────────────────────────────
export async function getActiveWorkoutIds(): Promise<string[]> {
  return dbGetActiveWorkoutIds();
}

export async function persistActiveWorkoutIds(ids: string[]): Promise<void> {
  return dbPersistActiveWorkoutIds(ids);
}

// ── Exercises ────────────────────────────────────────────────────────────────
export async function loadExercises(): Promise<Exercise[]> {
  return dbLoadExercises();
}

export async function saveExercises(exercises: Exercise[]): Promise<void> {
  const current = await dbLoadExercises();
  const ids = new Set(exercises.map((e) => e.id));
  for (const e of exercises) await dbUpsertExercise(e, true);
  for (const e of current) if (!ids.has(e.id)) await dbDeleteExercise(e.id);
  pushDirty().catch(() => {});
}

// ── Settings ─────────────────────────────────────────────────────────────────
export async function loadSettings(): Promise<AppSettings> {
  return dbLoadSettings();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await dbSaveSettings(settings);
  pushDirty().catch(() => {});
}

// ── Profile ──────────────────────────────────────────────────────────────────
export async function loadProfile(): Promise<UserProfile> {
  return dbLoadProfile();
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await dbSaveProfile(profile);
  pushDirty().catch(() => {});
}
