// Local SQLite cache — mirrors the server tables so the app works offline.
// Data is read from here by the contexts; writes go through here first, then
// get pushed to Supabase by sync.ts.
//
// NOTE: this module is native-only. On web, storage/index.ts and sync.ts
// short-circuit every call before reaching here, so the expo-sqlite import
// below is never actually evaluated in the browser. We keep it as a static
// import for native; if it ever causes a web module-eval error, switch to a
// lazy require() inside getDb().

import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  Exercise,
  WorkoutTemplate,
  WorkoutBlock,
  WorkoutItem,
  WorkoutLog,
  ItemLog,
  AppSettings,
  UserProfile,
  TargetedMuscle,
  DEFAULT_SETTINGS,
  DEFAULT_PROFILE,
} from '../models';

const DB_NAME = 'kbc.db';
let db: SQLiteDatabase | null = null;

async function getDb(): Promise<SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(PRAGMA);
    await db.execAsync(SCHEMA);
  }
  return db;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const num = (v: any, fallback = 0): number =>
  v === null || v === undefined || v === '' || isNaN(Number(v)) ? fallback : Number(v);
const str = (v: any, fallback = ''): string => (v === null || v === undefined ? fallback : String(v));
const bool = (v: any): boolean => !!v && v !== 0;

// ── Init ──────────────────────────────────────────────────────────────────────
const PRAGMA = `PRAGMA journal_mode = WAL;`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rep_mode TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  muscles TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  dirty INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  blocks TEXT NOT NULL DEFAULT '[]',
  alarm_minutes INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  dirty INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  template_id TEXT,
  workout_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  total_duration_seconds INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  is_partial INTEGER NOT NULL DEFAULT 0,
  item_logs TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  dirty INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

async function tx<T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const database = await getDb();
  return fn(database);
}

// ── Generic KV (settings, profile, activeWorkoutIds) ──────────────────────────
async function kvGet<T>(key: string, fallback: T): Promise<T> {
  return tx(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM kv WHERE key = ?',
      [key],
    );
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  });
}

async function kvSet(key: string, value: unknown, dirty = false): Promise<void> {
  await tx(async (db) => {
    await db.runAsync(
      `INSERT INTO kv (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, JSON.stringify(value)],
    );
  });
  if (dirty) await markDirty('kv', key);
}

// ── Dirty tracking for write-through push ─────────────────────────────────────
async function markDirty(table: 'exercises' | 'templates' | 'logs' | 'kv', id: string): Promise<void> {
  // For the entity tables, dirty is a column updated directly by the upsert.
  // For KV we track a separate list.
  if (table === 'kv') {
    const pending = await kvGet<string[]>('__pending_kv', []);
    if (!pending.includes(id)) pending.push(id);
    await tx(async (db) => {
      await db.runAsync(
        `INSERT INTO kv (key, value) VALUES ('__pending_kv', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [JSON.stringify(pending)],
      );
    });
  }
}

// ── Exercises ─────────────────────────────────────────────────────────────────
function exerciseFromRow(r: any): Exercise {
  return {
    id: r.id,
    name: r.name,
    repMode: r.rep_mode,
    category: r.category,
    description: r.description ?? undefined,
    videoUrl: r.video_url ?? undefined,
    muscles: JSON.parse(r.muscles || '[]') as TargetedMuscle[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function dbLoadExercises(): Promise<Exercise[]> {
  return tx(async (db) => {
    const rows = await db.getAllAsync('SELECT * FROM exercises ORDER BY created_at DESC');
    return rows.map(exerciseFromRow);
  });
}

export async function dbUpsertExercise(ex: Exercise, dirty = true): Promise<void> {
  await tx(async (db) => {
    await db.runAsync(
      `INSERT INTO exercises (id, name, rep_mode, category, description, video_url, muscles, created_at, updated_at, dirty)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, rep_mode=excluded.rep_mode, category=excluded.category,
         description=excluded.description, video_url=excluded.video_url, muscles=excluded.muscles,
         updated_at=excluded.updated_at, dirty = excluded.dirty`,
      [
        ex.id,
        ex.name,
        ex.repMode,
        ex.category,
        ex.description ?? null,
        ex.videoUrl ?? null,
        JSON.stringify(ex.muscles),
        ex.createdAt,
        ex.updatedAt,
        dirty ? 1 : 0,
      ],
    );
  });
}

export async function dbDeleteExercise(id: string): Promise<void> {
  await tx(async (db) => {
    await db.runAsync('DELETE FROM exercises WHERE id = ?', [id]);
  });
}

// ── Templates (blocks/items stored as JSON blob — they move together) ─────────
export async function dbLoadTemplates(): Promise<WorkoutTemplate[]> {
  return tx(async (db) => {
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      blocks: string;
      alarm_minutes: number | null;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM templates ORDER BY created_at ASC');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      blocks: JSON.parse(r.blocks || '[]') as WorkoutBlock[],
      alarmMinutes: r.alarm_minutes ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  });
}

export async function dbUpsertTemplate(tpl: WorkoutTemplate, dirty = true): Promise<void> {
  await tx(async (db) => {
    await db.runAsync(
      `INSERT INTO templates (id, name, blocks, alarm_minutes, created_at, updated_at, dirty)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, blocks=excluded.blocks, alarm_minutes=excluded.alarm_minutes,
         updated_at=excluded.updated_at, dirty = excluded.dirty`,
      [
        tpl.id,
        tpl.name,
        JSON.stringify(tpl.blocks),
        tpl.alarmMinutes ?? null,
        tpl.createdAt,
        tpl.updatedAt,
        dirty ? 1 : 0,
      ],
    );
  });
}

export async function dbDeleteTemplate(id: string): Promise<void> {
  await tx(async (db) => {
    await db.runAsync('DELETE FROM templates WHERE id = ?', [id]);
  });
}

// ── Logs (itemLogs stored as JSON blob) ───────────────────────────────────────
export async function dbLoadLogs(): Promise<WorkoutLog[]> {
  return tx(async (db) => {
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM logs WHERE deleted_at IS NULL ORDER BY started_at DESC",
    );
    return rows.map((r) => ({
      id: r.id,
      templateId: r.template_id,
      workoutName: r.workout_name,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      totalDurationSeconds: r.total_duration_seconds,
      note: r.note,
      isPartial: bool(r.is_partial),
      itemLogs: JSON.parse(r.item_logs || '[]') as ItemLog[],
    }));
  });
}

export async function dbUpsertLog(log: WorkoutLog, dirty = true): Promise<void> {
  await tx(async (db) => {
    await db.runAsync(
      `INSERT INTO logs (id, template_id, workout_name, started_at, ended_at,
         total_duration_seconds, note, is_partial, item_logs, updated_at, deleted_at, dirty)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         template_id=excluded.template_id, workout_name=excluded.workout_name,
         started_at=excluded.started_at, ended_at=excluded.ended_at,
         total_duration_seconds=excluded.total_duration_seconds, note=excluded.note,
         is_partial=excluded.is_partial, item_logs=excluded.item_logs,
         updated_at=excluded.updated_at, deleted_at=excluded.deleted_at, dirty = excluded.dirty`,
      [
        log.id,
        log.templateId,
        log.workoutName,
        log.startedAt,
        log.endedAt,
        log.totalDurationSeconds,
        log.note,
        log.isPartial ? 1 : 0,
        JSON.stringify(log.itemLogs),
        log.endedAt,
        null,
        dirty ? 1 : 0,
      ],
    );
  });
}

export async function dbDeleteLog(id: string, soft = true): Promise<void> {
  await tx(async (db) => {
    if (soft) {
      await db.runAsync(
        `UPDATE logs SET deleted_at = ?, dirty = 1 WHERE id = ?`,
        [new Date().toISOString(), id],
      );
    } else {
      await db.runAsync('DELETE FROM logs WHERE id = ?', [id]);
    }
  });
}

// ── Settings / Profile / Active workouts ───────────────────────────────────────
export async function dbLoadSettings(): Promise<AppSettings> {
  return kvGet<AppSettings>('settings', DEFAULT_SETTINGS);
}

export async function dbSaveSettings(settings: AppSettings): Promise<void> {
  // Never persist perplexityApiKey in the new app — it's a server secret.
  const { perplexityApiKey, ...safe } = settings;
  void perplexityApiKey;
  await kvSet('settings', safe, true);
}

export async function dbLoadProfile(): Promise<UserProfile> {
  return kvGet<UserProfile>('profile', DEFAULT_PROFILE);
}

export async function dbSaveProfile(profile: UserProfile): Promise<void> {
  await kvSet('profile', profile, true);
}

export async function dbGetActiveWorkoutIds(): Promise<string[]> {
  return kvGet<string[]>('activeWorkoutIds', []);
}

export async function dbPersistActiveWorkoutIds(ids: string[]): Promise<void> {
  await kvSet('activeWorkoutIds', ids, false);
}

// ── Sync-meta (last pull timestamp) ─────────────────────────────────────────────
export async function getLastPullAt(): Promise<string | null> {
  return tx(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM sync_meta WHERE key = 'last_pull_at'",
    );
    return row?.value ?? null;
  });
}

export async function setLastPullAt(iso: string): Promise<void> {
  await tx(async (db) => {
    await db.runAsync(
      `INSERT INTO sync_meta (key, value) VALUES ('last_pull_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [iso],
    );
  });
}

// ── Dirty queues (consumed by sync.push) ───────────────────────────────────────
export async function getDirtyExercises(): Promise<Exercise[]> {
  return tx(async (db) => {
    const rows = await db.getAllAsync<any>('SELECT * FROM exercises WHERE dirty = 1');
    return rows.map(exerciseFromRow);
  });
}
export async function clearDirtyExercise(id: string): Promise<void> {
  await tx(async (db) => db.runAsync('UPDATE exercises SET dirty = 0 WHERE id = ?', [id]));
}

export async function getDirtyTemplates(): Promise<WorkoutTemplate[]> {
  return tx(async (db) => {
    const rows = await db.getAllAsync<any>('SELECT * FROM templates WHERE dirty = 1');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      blocks: JSON.parse(r.blocks || '[]'),
      alarmMinutes: r.alarm_minutes ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) as WorkoutTemplate[];
  });
}
export async function clearDirtyTemplate(id: string): Promise<void> {
  await tx(async (db) => db.runAsync('UPDATE templates SET dirty = 0 WHERE id = ?', [id]));
}

export async function getDirtyLogs(): Promise<WorkoutLog[]> {
  return tx(async (db) => {
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM logs WHERE dirty = 1 AND deleted_at IS NULL',
    );
    return rows.map((r) => ({
      id: r.id,
      templateId: r.template_id,
      workoutName: r.workout_name,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      totalDurationSeconds: r.total_duration_seconds,
      note: r.note,
      isPartial: bool(r.is_partial),
      itemLogs: JSON.parse(r.item_logs || '[]'),
    })) as WorkoutLog[];
  });
}

/** IDs of logs that were soft-deleted locally and still need to be pushed. */
export async function getDirtyDeletedLogIds(): Promise<string[]> {
  return tx(async (db) => {
    const rows = await db.getAllAsync<any>(
      'SELECT id FROM logs WHERE dirty = 1 AND deleted_at IS NOT NULL',
    );
    return rows.map((r) => r.id as string);
  });
}
export async function clearDirtyLog(id: string): Promise<void> {
  await tx(async (db) => db.runAsync('UPDATE logs SET dirty = 0 WHERE id = ?', [id]));
}

export async function getPendingKv(): Promise<string[]> {
  return kvGet<string[]>('__pending_kv', []);
}
export async function clearPendingKv(): Promise<void> {
  await tx(async (db) => {
    await db.runAsync(
      `INSERT INTO kv (key, value) VALUES ('__pending_kv', '[]')
       ON CONFLICT(key) DO UPDATE SET value = '[]'`,
    );
  });
}
