// sync.ts — write-through sync engine.
//
// Write path: every save writes to the local SQLite cache immediately (so the UI
// is instant and offline-capable), then schedules a push. Push upserts the
// dirty row to Supabase; on success the row is marked clean.
//
// Pull path: fetches rows updated after last_pull_at, upserts them into the
// cache, applies remote soft-deletes, and bumps last_pull_at.
//
// Conflict resolution: last-write-wins by server updated_at. Push always sends
// the client updated_at; the server's updated_at trigger bumps it on write, so
// the next pull will reconcile anything that was edited elsewhere.

import {
  dbUpsertExercise,
  dbUpsertTemplate,
  dbUpsertLog,
  dbDeleteExercise,
  dbDeleteTemplate,
  dbDeleteLog,
  dbLoadExercises,
  dbLoadTemplates,
  dbLoadLogs,
  dbLoadSettings,
  dbSaveSettings,
  dbLoadProfile,
  dbSaveProfile,
  dbGetActiveWorkoutIds,
  dbPersistActiveWorkoutIds,
  getLastPullAt,
  setLastPullAt,
  getDirtyExercises,
  clearDirtyExercise,
  getDirtyTemplates,
  clearDirtyTemplate,
  getDirtyLogs,
  clearDirtyLog,
  getPendingKv,
  clearPendingKv,
} from './db';
import {
  apiPullExercises,
  apiPullTemplates,
  apiPullLogs,
  apiPullSettings,
  apiPushSettings,
  apiPullProfile,
  apiPushProfile,
  apiUpsertExercise,
  apiUpsertTemplate,
  apiUpsertLog,
  apiDeleteExercise,
  apiDeleteTemplate,
  apiDeleteLog,
} from './api';
import { Exercise, WorkoutTemplate, WorkoutLog } from '../models';

let pushInFlight = false;

/** Push all locally-dirty rows to the server. Best-effort; errors are swallowed
 *  so a failed push doesn't crash a UI save — the row stays dirty and will be
 *  retried on the next push/foreground. */
export async function pushDirty(): Promise<void> {
  if (pushInFlight) return;
  pushInFlight = true;
  try {
    // Exercises
    for (const ex of await getDirtyExercises()) {
      try {
        await apiUpsertExercise(ex);
        await clearDirtyExercise(ex.id);
      } catch (e) {
        console.warn('push exercise failed', ex.id, e);
      }
    }
    // Templates
    for (const tpl of await getDirtyTemplates()) {
      try {
        await apiUpsertTemplate(tpl);
        await clearDirtyTemplate(tpl.id);
      } catch (e) {
        console.warn('push template failed', tpl.id, e);
      }
    }
    // Logs
    for (const log of await getDirtyLogs()) {
      try {
        await apiUpsertLog(log);
        await clearDirtyLog(log.id);
      } catch (e) {
        console.warn('push log failed', log.id, e);
      }
    }
    // KV (settings, profile)
    const pending = await getPendingKv();
    if (pending.includes('settings')) {
      try {
        await apiPushSettings(await dbLoadSettings());
      } catch (e) {
        console.warn('push settings failed', e);
      }
    }
    if (pending.includes('profile')) {
      try {
        await apiPushProfile(await dbLoadProfile());
      } catch (e) {
        console.warn('push profile failed', e);
      }
    }
    await clearPendingKv();
  } finally {
    pushInFlight = false;
  }
}

/** Pull all server changes since the last sync and merge into the local cache. */
export async function pullAll(): Promise<void> {
  const since = await getLastPullAt();
  const newCursor = new Date().toISOString();

  try {
    const remoteExercises = await apiPullExercises(since);
    for (const ex of remoteExercises) await dbUpsertExercise(ex, false);

    const remoteTemplates = await apiPullTemplates(since);
    for (const tpl of remoteTemplates) await dbUpsertTemplate(tpl, false);

    const { logs, deletedIds } = await apiPullLogs(since);
    for (const log of logs) await dbUpsertLog(log, false);
    for (const id of deletedIds) await dbDeleteLog(id, false);

    const remoteSettings = await apiPullSettings();
    if (remoteSettings) {
      // Merge over local defaults but keep any locally-unsynced key excluded.
      const { perplexityApiKey, ...rest } = remoteSettings as any;
      void perplexityApiKey;
      await dbSaveSettings(rest);
    }
    const remoteProfile = await apiPullProfile();
    if (remoteProfile) await dbSaveProfile(remoteProfile);
  } catch (e) {
    console.warn('pullAll failed (will retry next foreground)', e);
    return;
  }

  await setLastPullAt(newCursor);
}

/** Convenience: flush local edits, then pull. Used after a write. */
export async function syncNow(): Promise<void> {
  await pushDirty();
  await pullAll();
}

// Re-export the local loaders the contexts need (they read from the cache).
export {
  dbLoadExercises as loadExercises,
  dbLoadTemplates as loadTemplates,
  dbLoadLogs as loadLogs,
  dbLoadSettings as loadSettings,
  dbLoadProfile as loadProfile,
  dbGetActiveWorkoutIds as getActiveWorkoutIds,
  dbPersistActiveWorkoutIds as persistActiveWorkoutIds,
};
