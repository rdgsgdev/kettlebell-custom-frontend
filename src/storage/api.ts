// api.ts — thin Supabase (PostgREST) CRUD wrappers.
// Translates between the nested client model (WorkoutTemplate.blocks[].items[],
// WorkoutLog.itemLogs[]) and the normalized server tables.
//
// Owner (user_id) is set automatically by RLS using the caller's JWT, so we
// never send a user_id from the client.

import { supabase, SUPABASE_URL } from '../config/supabase';
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
} from '../models';

// ── Mapping helpers (snake_case ↔ camelCase) ─────────────────────────────────

type TemplateRow = {
  id: string;
  name: string;
  alarm_minutes: number | null;
  archived: boolean | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  workout_blocks: BlockRow[];
};
type BlockRow = {
  id: string;
  type: string;
  sort_order: number;
  emom_minutes: number | null;
  custom_block_def_id: string | null;
  custom_label: string | null;
  custom_color: string | null;
  workout_items: ItemRow[];
};
type ItemRow = {
  id: string;
  exercise_name: string;
  rep_mode: string;
  reps: number;
  sets: number | null;
  duration_seconds: number | null;
  weight: number;
  rest_time: number;
  sort_order: number;
};

function itemFromRow(r: ItemRow): WorkoutItem {
  return {
    id: r.id,
    exerciseName: r.exercise_name,
    repMode: r.rep_mode as WorkoutItem['repMode'],
    reps: r.reps,
    sets: r.sets ?? undefined,
    durationSeconds: r.duration_seconds ?? undefined,
    weight: Number(r.weight),
    restTime: r.rest_time,
  };
}

function blockFromRow(r: BlockRow): WorkoutBlock {
  const items = [...r.workout_items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(itemFromRow);
  return {
    id: r.id,
    type: r.type as WorkoutBlock['type'],
    items,
    emomMinutes: r.emom_minutes ?? undefined,
    customBlockDefId: r.custom_block_def_id ?? undefined,
    customLabel: r.custom_label ?? undefined,
    customColor: r.custom_color ?? undefined,
  };
}

export function templateFromRow(r: TemplateRow): WorkoutTemplate {
  const blocks = [...r.workout_blocks]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(blockFromRow);
  return {
    id: r.id,
    name: r.name,
    blocks,
    alarmMinutes: r.alarm_minutes ?? undefined,
    archived: r.archived ?? false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── Exercises ─────────────────────────────────────────────────────────────────
type ExerciseRow = {
  id: string;
  name: string;
  rep_mode: string;
  category: string;
  description: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
  exercise_muscles: { muscle_group: string; is_primary: boolean }[];
};

function exerciseFromRow(r: ExerciseRow): Exercise {
  return {
    id: r.id,
    name: r.name,
    repMode: r.rep_mode as Exercise['repMode'],
    category: r.category as Exercise['category'],
    description: r.description ?? undefined,
    videoUrl: r.video_url ?? undefined,
    muscles: (r.exercise_muscles || []).map((m) => ({
      group: m.muscle_group as TargetedMuscle['group'],
      isPrimary: m.is_primary,
    })),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function apiPullExercises(since: string | null): Promise<Exercise[]> {
  let q = supabase
    .from('exercises')
    .select('*, exercise_muscles(muscle_group, is_primary)')
    .order('updated_at', { ascending: true });
  if (since) q = q.gt('updated_at', since);
  const { data, error } = await q;
  if (error) throw error;
  return (data as ExerciseRow[]).map(exerciseFromRow);
}

export async function apiUpsertExercise(ex: Exercise): Promise<void> {
  const { error: eErr } = await supabase.from('exercises').upsert(
    {
      id: ex.id,
      name: ex.name,
      rep_mode: ex.repMode,
      category: ex.category,
      description: ex.description ?? null,
      video_url: ex.videoUrl ?? null,
      created_at: ex.createdAt,
      updated_at: ex.updatedAt,
    },
    { onConflict: 'id' },
  );
  if (eErr) throw eErr;

  // Replace muscles set.
  const { error: dErr } = await supabase
    .from('exercise_muscles')
    .delete()
    .eq('exercise_id', ex.id);
  if (dErr) throw dErr;
  if (ex.muscles.length > 0) {
    const { error: mErr } = await supabase.from('exercise_muscles').upsert(
      ex.muscles.map((m) => ({
        exercise_id: ex.id,
        muscle_group: m.group,
        is_primary: m.isPrimary,
      })),
      { onConflict: 'exercise_id,muscle_group' },
    );
    if (mErr) throw mErr;
  }
}

export async function apiDeleteExercise(id: string): Promise<void> {
  const { error } = await supabase.from('exercises').delete().eq('id', id);
  if (error) throw error;
}

// ── Templates (with nested blocks/items) ───────────────────────────────────────
export async function apiPullTemplates(since: string | null): Promise<{ templates: WorkoutTemplate[]; deletedIds: string[] }> {
  let q = supabase
    .from('workout_templates')
    .select('*, workout_blocks(*, workout_items(*))')
    .order('created_at', { ascending: false });
  if (since) q = q.gt('updated_at', since);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data as TemplateRow[];
  const templates = rows.filter((r) => !r.deleted_at).map(templateFromRow);
  const deletedIds = rows.filter((r) => !!r.deleted_at).map((r) => r.id);
  return { templates, deletedIds };
}

export async function apiUpsertTemplate(tpl: WorkoutTemplate): Promise<void> {
  const { error } = await supabase.from('workout_templates').upsert(
    {
      id: tpl.id,
      name: tpl.name,
      alarm_minutes: tpl.alarmMinutes ?? null,
      archived: tpl.archived ?? false,
      created_at: tpl.createdAt,
      updated_at: tpl.updatedAt,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;

  // Push blocks + items (delete-then-insert keeps it simple and order-correct).
  const { error: dbErr } = await supabase
    .from('workout_blocks')
    .delete()
    .eq('template_id', tpl.id);
  if (dbErr) throw dbErr;

  for (let bi = 0; bi < tpl.blocks.length; bi++) {
    const blk = tpl.blocks[bi];
    const { error: bErr } = await supabase.from('workout_blocks').upsert(
      {
        id: blk.id,
        template_id: tpl.id,
        type: blk.type,
        sort_order: bi,
        emom_minutes: blk.emomMinutes ?? null,
        custom_block_def_id: blk.customBlockDefId ?? null,
        custom_label: blk.customLabel ?? null,
        custom_color: blk.customColor ?? null,
      },
      { onConflict: 'id' },
    );
    if (bErr) throw bErr;

    for (let ii = 0; ii < blk.items.length; ii++) {
      const it = blk.items[ii];
      const { error: iErr } = await supabase.from('workout_items').upsert(
        {
          id: it.id,
          block_id: blk.id,
          exercise_name: it.exerciseName,
          rep_mode: it.repMode,
          reps: it.reps,
          sets: it.sets ?? null,
          duration_seconds: it.durationSeconds ?? null,
          weight: it.weight,
          rest_time: it.restTime,
          sort_order: ii,
        },
        { onConflict: 'id' },
      );
      if (iErr) throw iErr;
    }
  }
}

export async function apiDeleteTemplate(id: string): Promise<void> {
  // Soft delete so other devices learn about it via pull (mirrors logs).
  const { error } = await supabase
    .from('workout_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ── Logs (with nested item_logs) ───────────────────────────────────────────────
type LogRow = {
  id: string;
  template_id: string | null;
  workout_name: string;
  started_at: string;
  ended_at: string;
  total_duration_seconds: number;
  note: string;
  is_partial: boolean;
  updated_at: string;
  deleted_at: string | null;
  item_logs: ItemLogRow[];
};
type ItemLogRow = {
  id: string;
  block_id: string | null;
  block_type: string;
  custom_label: string | null;
  custom_color: string | null;
  exercise_name: string;
  reps: number;
  reps_left: number | null;
  reps_right: number | null;
  weight: number;
  rep_mode: string;
  completed: boolean;
  skipped: boolean;
  emom_minute: number | null;
  sort_order: number;
};

function itemLogFromRow(r: ItemLogRow): ItemLog {
  return {
    id: r.id,
    blockId: r.block_id ?? undefined,
    blockType: r.block_type as ItemLog['blockType'],
    customLabel: r.custom_label ?? undefined,
    customColor: r.custom_color ?? undefined,
    exerciseName: r.exercise_name,
    reps: r.reps,
    repsLeft: r.reps_left ?? undefined,
    repsRight: r.reps_right ?? undefined,
    weight: Number(r.weight),
    repMode: r.rep_mode as ItemLog['repMode'],
    completed: r.completed,
    skipped: r.skipped,
    emomMinute: r.emom_minute ?? undefined,
  };
}

export function logFromRow(r: LogRow): WorkoutLog {
  const itemLogs = [...(r.item_logs || [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(itemLogFromRow);
  return {
    id: r.id,
    templateId: r.template_id ?? '',
    workoutName: r.workout_name,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    totalDurationSeconds: r.total_duration_seconds,
    note: r.note,
    isPartial: r.is_partial,
    itemLogs,
  };
}

export async function apiPullLogs(since: string | null): Promise<{ logs: WorkoutLog[]; deletedIds: string[] }> {
  // Updated logs (including newly-soft-deleted ones, which we still want to see
  // to mirror the deletion locally). Ordered newest-first by started_at so the
  // History list shows recent workouts on top (matches the native cache sort).
  let q = supabase
    .from('workout_logs')
    .select('*, item_logs(*)')
    .order('started_at', { ascending: false });
  if (since) q = q.gt('updated_at', since);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data as LogRow[];
  const logs = rows.filter((r) => !r.deleted_at).map(logFromRow);
  const deletedIds = rows.filter((r) => !!r.deleted_at).map((r) => r.id);
  return { logs, deletedIds };
}

export async function apiUpsertLog(log: WorkoutLog): Promise<void> {
  const { error } = await supabase.from('workout_logs').upsert(
    {
      id: log.id,
      template_id: log.templateId || null,
      workout_name: log.workoutName,
      started_at: log.startedAt,
      ended_at: log.endedAt,
      total_duration_seconds: log.totalDurationSeconds,
      note: log.note,
      is_partial: log.isPartial,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;

  const { error: dErr } = await supabase.from('item_logs').delete().eq('log_id', log.id);
  if (dErr) throw dErr;

  for (let li = 0; li < log.itemLogs.length; li++) {
    const il = log.itemLogs[li];
    const { error: iErr } = await supabase.from('item_logs').upsert(
      {
        id: il.id,
        log_id: log.id,
        block_id: il.blockId ?? null,
        block_type: il.blockType,
        custom_label: il.customLabel ?? null,
        custom_color: il.customColor ?? null,
        exercise_name: il.exerciseName,
        reps: il.reps,
        reps_left: il.repsLeft ?? null,
        reps_right: il.repsRight ?? null,
        weight: il.weight,
        rep_mode: il.repMode,
        completed: il.completed,
        skipped: !!il.skipped,
        emom_minute: il.emomMinute ?? null,
        sort_order: li,
      },
      { onConflict: 'id' },
    );
    if (iErr) throw iErr;
  }
}

export async function apiDeleteLog(id: string): Promise<void> {
  // Soft delete so other devices learn about it via pull.
  const { error } = await supabase
    .from('workout_logs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ── Settings / Profile ──────────────────────────────────────────────────────────
export async function apiPullSettings(): Promise<AppSettings | null> {
  const { data, error } = await supabase
    .from('settings')
    .select('theme, custom_block_defs')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    theme: data.theme,
    customBlockDefs: data.custom_block_defs ?? [],
  };
}

export async function apiPushSettings(settings: AppSettings): Promise<void> {
  const { perplexityApiKey, ...safe } = settings;
  void perplexityApiKey;
  const { error } = await supabase.from('settings').upsert(
    {
      theme: safe.theme,
      custom_block_defs: safe.customBlockDefs ?? [],
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

export async function apiPullProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('name, weight_kg, height_cm, birth_year, goals')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    name: data.name ?? '',
    weightKg: data.weight_kg ?? undefined,
    heightCm: data.height_cm ?? undefined,
    birthYear: data.birth_year ?? undefined,
    goals: data.goals ?? [],
  };
}

export async function apiPushProfile(profile: UserProfile): Promise<void> {
  const { error } = await supabase.from('profiles').upsert(
    {
      name: profile.name,
      weight_kg: profile.weightKg ?? null,
      height_cm: profile.heightCm ?? null,
      birth_year: profile.birthYear ?? null,
      goals: profile.goals ?? [],
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

// ── Import edge function (one-shot data migration) ────────────────────────────
export async function apiImportPayload(payload: unknown): Promise<{ ok: boolean; counters: unknown }> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Not authenticated.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/import`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `Import failed (${res.status})`);
  return json;
}
