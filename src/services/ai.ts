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

// ─── AI Coach chatbot ─────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// A template as returned by the edge function — no ids/timestamps yet (the
// frontend assigns those on save). Mirrors WorkoutTemplate but looser so we
// can coerce anything the AI returns.
export interface AITemplateBlock {
  type: string;
  items: {
    exerciseName: string;
    repMode: string;
    reps: number;
    sets?: number;
    weight: number;
    restTime: number;
    durationSeconds?: number;
  }[];
  emomMinutes?: number;
  customLabel?: string;
  customColor?: string;
}

export interface AITemplate {
  name: string;
  blocks: AITemplateBlock[];
  alarmMinutes?: number;
}

export interface AIExerciseProposal {
  name: string;
  category: string;
  repMode: string;
  description: string;
  muscles: { group: string; isPrimary: boolean }[];
}

export interface AICustomBlockDef {
  label: string;
  color: string;
  baseType: 'standard' | 'emom';
}

export interface AIChatResponse {
  reply: string;
  template?: AITemplate;
  exercises?: AIExerciseProposal[];
  customBlockDefs?: AICustomBlockDef[];
}

/**
 * Send a conversation + compressed app context to the ai-chat edge function.
 * The Perplexity key stays server-side. Throws if there's no session.
 */
export async function chatWithAI(
  messages: ChatMessage[],
  context: unknown,
): Promise<AIChatResponse> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Sign in required to use the AI Coach.');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, context }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `AI Coach failed (${res.status}).`);
  return json as AIChatResponse;
}
