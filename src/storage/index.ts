// storage/index.ts — facade preserving the original AsyncStorage API surface
// so AppContext / SettingsContext continue to call the same function names.
//
// Platform-aware:
//  * Native (iOS/Android): write-through SQLite cache + Supabase sync. Reads
//    come from the cache; writes hit the cache first then push to Supabase.
//  * Web: no local cache (expo-sqlite is unreliable in browsers). Reads and
//    writes go straight to Supabase — online-only, which is fine for web.

import { Platform } from 'react-native';
import {
  WorkoutTemplate,
  WorkoutLog,
  Exercise,
  AppSettings,
  UserProfile,
  DEFAULT_SETTINGS,
  DEFAULT_PROFILE,
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
import {
  apiPullExercises,
  apiPullTemplates,
  apiPullLogs,
  apiPullSettings,
  apiPullProfile,
  apiUpsertExercise,
  apiUpsertTemplate,
  apiUpsertLog,
  apiDeleteExercise,
  apiDeleteTemplate,
  apiDeleteLog,
  apiPushSettings,
  apiPushProfile,
} from './api';

export { pullAll };

const isWeb = Platform.OS === 'web';

// ── Web helpers: online-only reads/writes ─────────────────────────────────────
// In-memory store for web-only ephemeral keys (active workout selection).
let webActiveIds: string[] = [];

// ── Templates ────────────────────────────────────────────────────────────────
export async function loadTemplates(): Promise<WorkoutTemplate[]> {
  if (isWeb) {
    const { templates } = await apiPullTemplates(null);
    return templates;
  }
  return dbLoadTemplates();
}

export async function saveTemplates(templates: WorkoutTemplate[]): Promise<void> {
  if (isWeb) {
    const { templates: remote } = await apiPullTemplates(null);
    const ids = new Set(templates.map((t) => t.id));
    for (const t of templates) await apiUpsertTemplate(t);
    for (const t of remote) if (!ids.has(t.id)) await apiDeleteTemplate(t.id);
    return;
  }
  const current = await dbLoadTemplates();
  const ids = new Set(templates.map((t) => t.id));
  for (const t of templates) await dbUpsertTemplate(t, true);
  for (const t of current) if (!ids.has(t.id)) await dbDeleteTemplate(t.id, true);
  pushDirty().catch(() => {});
}

/** Upsert a single template. Preferred over saveTemplates() for add/update/archive
 *  so we don't accidentally re-insert templates soft-deleted by another device. */
export async function saveOneTemplate(template: WorkoutTemplate): Promise<void> {
  if (isWeb) {
    await apiUpsertTemplate(template);
    return;
  }
  await dbUpsertTemplate(template, true);
  pushDirty().catch(() => {});
}

/** Soft-delete a single template (sets deleted_at). Mirrors deleteOneLog. */
export async function deleteOneTemplate(id: string): Promise<void> {
  if (isWeb) {
    await apiDeleteTemplate(id);
    return;
  }
  await dbDeleteTemplate(id, true);
  pushDirty().catch(() => {});
}

// ── Logs ─────────────────────────────────────────────────────────────────────
export async function loadLogs(): Promise<WorkoutLog[]> {
  if (isWeb) {
    const { logs } = await apiPullLogs(null);
    return logs;
  }
  return dbLoadLogs();
}

export async function saveLogs(logs: WorkoutLog[]): Promise<void> {
  if (isWeb) {
    const { logs: remote } = await apiPullLogs(null);
    const ids = new Set(logs.map((l) => l.id));
    for (const l of logs) await apiUpsertLog(l);
    for (const l of remote) if (!ids.has(l.id)) await apiDeleteLog(l.id);
    return;
  }
  const current = await dbLoadLogs();
  const ids = new Set(logs.map((l) => l.id));
  for (const l of logs) await dbUpsertLog(l, true);
  for (const l of current) if (!ids.has(l.id)) await dbDeleteLog(l.id, true);
  pushDirty().catch(() => {});
}

/** Upsert a single log. Preferred over saveLogs() for add/update so we don't
 *  accidentally re-insert logs that were soft-deleted by another device. */
export async function saveOneLog(log: WorkoutLog): Promise<void> {
  if (isWeb) {
    await apiUpsertLog(log);
    return;
  }
  await dbUpsertLog(log, true);
  pushDirty().catch(() => {});
}

/** Soft-delete a single log (sets deleted_at). On native this marks the row
 *  dirty so the deletion syncs to the server via pushDirty(); on web the
 *  soft-delete UPDATE is applied directly to Supabase. */
export async function deleteOneLog(id: string): Promise<void> {
  if (isWeb) {
    await apiDeleteLog(id);
    return;
  }
  await dbDeleteLog(id, true);
  pushDirty().catch(() => {});
}

// ── Active workout IDs (local-only, never persisted server-side) ──────────────
export async function getActiveWorkoutIds(): Promise<string[]> {
  if (isWeb) return webActiveIds;
  return dbGetActiveWorkoutIds();
}

export async function persistActiveWorkoutIds(ids: string[]): Promise<void> {
  if (isWeb) {
    webActiveIds = ids;
    return;
  }
  return dbPersistActiveWorkoutIds(ids);
}

// ── Exercises ────────────────────────────────────────────────────────────────
export async function loadExercises(): Promise<Exercise[]> {
  if (isWeb) return apiPullExercises(null);
  return dbLoadExercises();
}

export async function saveExercises(exercises: Exercise[]): Promise<void> {
  if (isWeb) {
    const remote = await apiPullExercises(null);
    const ids = new Set(exercises.map((e) => e.id));
    for (const e of exercises) await apiUpsertExercise(e);
    for (const e of remote) if (!ids.has(e.id)) await apiDeleteExercise(e.id);
    return;
  }
  const current = await dbLoadExercises();
  const ids = new Set(exercises.map((e) => e.id));
  for (const e of exercises) await dbUpsertExercise(e, true);
  for (const e of current) if (!ids.has(e.id)) await dbDeleteExercise(e.id);
  pushDirty().catch(() => {});
}

// ── Settings ─────────────────────────────────────────────────────────────────
export async function loadSettings(): Promise<AppSettings> {
  if (isWeb) {
    const s = await apiPullSettings();
    return s ?? DEFAULT_SETTINGS;
  }
  return dbLoadSettings();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  if (isWeb) {
    await apiPushSettings(settings);
    return;
  }
  await dbSaveSettings(settings);
  pushDirty().catch(() => {});
}

// ── Profile ──────────────────────────────────────────────────────────────────
export async function loadProfile(): Promise<UserProfile> {
  if (isWeb) {
    const p = await apiPullProfile();
    return p ?? DEFAULT_PROFILE;
  }
  return dbLoadProfile();
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  if (isWeb) {
    await apiPushProfile(profile);
    return;
  }
  await dbSaveProfile(profile);
  pushDirty().catch(() => {});
}
