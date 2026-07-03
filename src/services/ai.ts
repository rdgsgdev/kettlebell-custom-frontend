// ai.ts — client for the `ai-exercise` Supabase Edge Function.
// Replaces the legacy perplexity.ts. The Perplexity API key lives only in the
// edge function's secrets, so the app carries no key.

import { ExerciseCategory, MuscleGroup, RepMode, TargetedMuscle } from '../models';
import { supabase, SUPABASE_URL } from '../config/supabase';

export interface AIExerciseResult {
  name: string;
  category: ExerciseCategory;
  repMode: RepMode;
  description: string;
  muscles: TargetedMuscle[];
  videoUrl?: string;
}

/**
 * Ask the server-side AI proxy to enrich an exercise name.
 * Throws if there's no session or the function returns an error.
 */
export async function generateExerciseFromAI(exerciseName: string): Promise<AIExerciseResult> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Sign in required to use AI exercise lookup.');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-exercise`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ exerciseName }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `AI lookup failed (${res.status}).`);
  return json as AIExerciseResult;
}

// Re-export the type under the legacy name for drop-in compatibility.
export type { ExerciseCategory, MuscleGroup, RepMode, TargetedMuscle };
