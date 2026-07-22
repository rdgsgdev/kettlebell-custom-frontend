// contextBuilder.ts — compresses the user's app data into a minimal payload
// for the ai-chat edge function. The goal is cost: raw objects would be ~10x
// larger in tokens. This produces ~1.5k tokens covering everything the AI needs
// to personalize a kettlebell workout.

import { Exercise, WorkoutTemplate, WorkoutLog, UserProfile, CustomBlockDef } from '../models';

/** A compressed, edge-function-friendly view of the app state. */
export interface ChatContext {
  profile: {
    name: string;
    weightKg?: number;
    heightCm?: number;
    birthYear?: number;
    goals: string[];
  };
  exercises: { name: string; repMode: string; category: string; primaryMuscles: string[] }[];
  templates: { name: string; summary: string }[];
  recentLogs: { name: string; date: string; durationMin: number; highlights: string }[];
  blockDefs: { label: string; baseType: string }[];
}

function summarizeTemplate(t: WorkoutTemplate): string {
  return t.blocks.map((b, bi) => {
    const label = b.customLabel || b.type;
    if (b.type === 'emom') {
      const exNames = b.items.map((i) => i.exerciseName).join('/');
      return `  ${bi + 1}. ${label} EMOM ${b.emomMinutes ?? 0}min: ${exNames}`;
    }
    const items = b.items
      .map((i) => `${i.exerciseName} ${i.reps}r${i.sets ? `×${i.sets}` : ''}${i.weight ? `@${i.weight}kg` : ''}`)
      .join(', ');
    return `  ${bi + 1}. ${label}: ${items}`;
  }).join('\n');
}

function summarizeLog(log: WorkoutLog): string {
  const completed = log.itemLogs.filter((i) => i.completed && !i.skipped);
  // Top 3 exercises by tonnage to show what they actually did.
  const byName: Record<string, number> = {};
  completed.forEach((i) => {
    const reps = i.repMode !== 'bilateral' && i.repsLeft != null
      ? (i.repsLeft || 0) + (i.repsRight ?? i.repsLeft ?? 0)
      : i.reps;
    byName[i.exerciseName] = (byName[i.exerciseName] || 0) + reps * i.weight;
  });
  const top = Object.entries(byName)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, t]) => `${name}(${Math.round(t)}kg)`)
    .join(', ');
  return log.isPartial ? `partial — ${top}` : top;
}

/**
 * Build the compressed context from live app state. Pure function — memoize
 * at the call site on the input arrays so it isn't rebuilt every chat turn.
 */
export function buildChatContext(
  profile: UserProfile,
  exercises: Exercise[],
  templates: WorkoutTemplate[],
  logs: WorkoutLog[],
  blockDefs: CustomBlockDef[],
): ChatContext {
  return {
    profile: {
      name: profile.name,
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
      birthYear: profile.birthYear,
      goals: profile.goals,
    },
    exercises: exercises
      .slice(0, 60) // cap to avoid token bloat on huge libraries
      .map((e) => ({
        name: e.name,
        repMode: e.repMode,
        category: e.category,
        primaryMuscles: e.muscles.filter((m) => m.isPrimary).map((m) => m.group),
      })),
    templates: templates
      .slice(0, 12)
      .map((t) => ({ name: t.name, summary: summarizeTemplate(t) })),
    recentLogs: logs
      .slice(0, 8) // logs are newest-first from AppContext
      .map((l) => ({
        name: l.workoutName,
        date: new Date(l.startedAt).toISOString().split('T')[0],
        durationMin: Math.round(l.totalDurationSeconds / 60),
        highlights: summarizeLog(l),
      })),
    blockDefs: blockDefs.map((b) => ({ label: b.label, baseType: b.baseType })),
  };
}
