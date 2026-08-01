import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { useKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppContext } from '../context/AppContext';
import { useSettings } from '../context/SettingsContext';
import { WorkoutItem, WorkoutBlock, WorkoutTemplate, WorkoutLog, ItemLog } from '../models';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { generateId, formatDuration, formatCountdown, blockDim, getBlockDisplayColor, getBlockDisplayLabel, juarezRepsForRound, getExecutionType } from '../utils/helpers';
import { scheduleAlarm, cancelAlarm, scheduleRestOverNotification, cancelRestOverNotification } from '../utils/notifications';
import NumericInput from '../components/common/NumericInput';
import ExerciseDetailModal from '../components/exercises/ExerciseDetailModal';
import QuickTimerConfigModal, {
  QuickTimerKind,
  QuickTimerConfig,
} from '../components/execution/QuickTimerConfigModal';

type Phase = 'idle' | 'exercise' | 'rest' | 'emom' | 'done' | 'stopped';

/**
 * Total execution steps (= rounds) for a Juarez Valley block. Always N, the
 * starting rep count, for BOTH single and superset:
 *  - Single: N interleaved performances (N, 1, N-1, 2, ...).
 *  - Superset: the two exercises alternate as a single ladder that meets in
 *    the middle — ex1 descends (N, N-1, ...) while ex2 ascends (1, 2, ...).
 *    Each performance is its own round, and the block ends the moment they
 *    meet (N=20 → 20 rounds: ... round 19 ex1 11, round 20 ex2 10 → done).
 */
function juarezStepCount(block: { juarezStartingReps?: number; juarezSuperset?: boolean }): number {
  return block.juarezStartingReps ?? 10;
}

/**
 * For a given Juarez step index, returns the exercise item index (0 or 1) and
 * the computed rep count for that step. Each step is ONE performance = ONE
 * round.
 *
 * Single exercise: step `i` → round `i`, exercise 0, reps from the interleaved
 * pyramid N, 1, N-1, 2, ... (even steps descend, odd ascend).
 *
 * Superset: the two exercises alternate, each performance its own round:
 *   step 0 → ex1 N reps (round 1); step 1 → ex2 1 rep (round 2);
 *   step 2 → ex1 N-1 reps (round 3); step 3 → ex2 2 reps (round 4); ...
 * ex1 descends (N, N-1, ...) and ex2 ascends (1, 2, ...); they meet and the
 * block finishes at step N-1.
 */
function juarezStepInfo(
  step: number,
  block: { juarezStartingReps?: number; juarezSuperset?: boolean },
): { itemIdx: number; reps: number; round: number } {
  const startingReps = block.juarezStartingReps ?? 10;
  if (block.juarezSuperset) {
    // Pairs of steps form one rung of the ladder: even step = ex1 (descend),
    // odd step = ex2 (ascend). Each step is still its own round.
    const rung = Math.floor(step / 2);
    const itemIdx = step % 2;
    const reps = itemIdx === 0 ? startingReps - rung : rung + 1;
    return { itemIdx, reps, round: step };
  }
  // Single exercise: use the interleaved pyramid directly.
  return { itemIdx: 0, reps: juarezRepsForRound(step, startingReps), round: step };
}

// ── Alarm state persistence ──────────────────────────────────────────────────
// The alarm countdown lives in component state, which is lost when the app is
// closed/relaunches — yet the OS-scheduled notification keeps ticking and will
// fire. We persist the wall-clock fire timestamp (+ paused state + notification
// id) so that on reopen we can recompute the remaining seconds and show the
// alarm card again. The alarm is a standalone countdown independent of which
// workout (if any) is running, so restore is NOT gated on the selected template
// (after a full relaunch the picker selection is lost and `template` may have
// defaulted to a different one — or be null for an ad-hoc/quick-timer alarm).
const ALARM_STATE_KEY = '@kbc/alarmState';
interface PersistedAlarmState {
  templateId: string;   // the workout that started the alarm (info only)
  fireAt: number;       // wall-clock ms when the alarm is due to fire
  paused: boolean;      // true if the user paused (fireAt is stale until resume)
  pausedRemainingSecs: number; // remaining seconds at pause time (used on resume)
  notifId: string | null;      // OS notification id (so cancel works after relaunch)
}
async function saveAlarmState(state: PersistedAlarmState | null): Promise<void> {
  try {
    if (state) await AsyncStorage.setItem(ALARM_STATE_KEY, JSON.stringify(state));
    else await AsyncStorage.removeItem(ALARM_STATE_KEY);
  } catch {
    // non-fatal — the OS notification still fires regardless
  }
}
async function loadAlarmState(): Promise<PersistedAlarmState | null> {
  try {
    const raw = await AsyncStorage.getItem(ALARM_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAlarmState;
    if (!parsed || typeof parsed.fireAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

interface SavedState {
  phase: Phase;
  blockIdx: number;
  manualIdx: number;
  manualSetIdx: number;
  restSeconds: number;
  restEndsAt: number | null;
  emomStep: number;
  emomSeconds: number;
  exerciseTimerSeconds: number;
  exerciseTimerActive: boolean;
}

// ── Ad-hoc (quick-timer) template builders ───────────────────────────────────
// These synthesize a throwaway WorkoutTemplate so the existing execution engine
// (which keys off `template` everywhere) can run an on-the-fly workout without a
// saved template. The synthetic id is non-empty so it persists cleanly to both
// SQLite (plain TEXT column) and Supabase (empty→null coercion avoided).
function buildAdhocTemplate(name: string, block: WorkoutBlock): WorkoutTemplate {
  const now = new Date().toISOString();
  return {
    id: 'adhoc-' + generateId(),
    name,
    blocks: [block],
    createdAt: now,
    updatedAt: now,
  };
}

/** Count-up stopwatch (e.g. jump rope / boxing / holds) — stopped manually.
 *  Exercises are optional; if none are passed, a single placeholder item keeps
 *  the timer runnable as a pure stopwatch (the original quick-timer behavior).
 *
 *  The block is stamped with a neutral "Count-up" custom label + accent color so
 *  the execution badge and history don't read "Finisher" — a count-up timer is
 *  for any timed work, not just finishers. `accentColor` is the live theme
 *  accent (mirrors the quick-timer button color), defaulting to the dark alias. */
function buildCountupAdhoc(items?: WorkoutItem[], accentColor?: string): WorkoutTemplate {
  const accent = accentColor ?? Colors.accent;
  const stamped = (items ?? []).map((it) => ({ ...it, executionType: 'countup' as const }));
  const blockItems: WorkoutItem[] = stamped.length > 0
    ? stamped
    : [{
        id: generateId(),
        exerciseName: 'Count-up',
        repMode: 'bilateral',
        reps: 0,
        weight: 0,
        restTime: 0,
        executionType: 'countup',
      }];
  return buildAdhocTemplate('Quick Timer', {
    id: generateId(),
    type: 'finisher',
    items: blockItems,
    customLabel: 'Count-up',
    customColor: accent,
  });
}

/** Juarez Valley ladder. `startingReps` (= rounds) is required; superset toggles
 *  a 2-exercise alternating ladder. Exercises are optional. */
function buildJuarezAdhoc(startingReps: number, superset: boolean, items?: WorkoutItem[]): WorkoutTemplate {
  const blockItems: WorkoutItem[] = (items ?? []).length > 0
    ? items!
    : [{
        id: generateId(),
        exerciseName: 'Exercise',
        repMode: 'bilateral',
        reps: 0,
        weight: 0,
        restTime: 0,
      }];
  return buildAdhocTemplate('Quick Juarez', {
    id: generateId(),
    type: 'juarez',
    juarezStartingReps: startingReps,
    juarezSuperset: superset,
    items: blockItems,
  });
}

/** EMOM timer. `minutes` (total duration) is required; exercises cycle per
 *  minute and are optional (empty = pure timer). */
function buildEmomAdhoc(minutes: number, items?: WorkoutItem[]): WorkoutTemplate {
  return buildAdhocTemplate('Quick EMOM', {
    id: generateId(),
    type: 'emom',
    emomMinutes: minutes,
    items: items ?? [],
  });
}

/** PR Attempt — a single reps exercise with a target rep count, run as a normal
 *  exercise (no timer). The user stops to record the actual reps achieved, which
 *  can be edited (during the run via the REPS pill, or at the review screen) if
 *  they beat or miss the target. Exercises are optional; if none are passed, a
 *  placeholder item keeps the attempt runnable. The block uses the success
 *  (green) color and a "PR Attempt" label so it stands out in execution + history. */
function buildPrAdhoc(targetReps: number, items?: WorkoutItem[]): WorkoutTemplate {
  const passed = (items ?? []).slice(0, 1).map((it) => ({
    ...it,
    executionType: 'reps' as const,
    reps: targetReps,
    sets: 1,
    restTime: 0,
  }));
  const blockItems: WorkoutItem[] = passed.length > 0
    ? passed
    : [{
        id: generateId(),
        exerciseName: 'PR Attempt',
        repMode: 'bilateral',
        reps: targetReps,
        weight: 0,
        restTime: 0,
        executionType: 'reps',
        sets: 1,
      }];
  return buildAdhocTemplate('Quick PR', {
    id: generateId(),
    type: 'mobility',
    items: blockItems,
    customLabel: 'PR Attempt',
    customColor: Colors.success,
  });
}

/** Dispatches a quick-timer config (from QuickTimerConfigModal) to the matching
 *  ad-hoc template builder. `accentColor` is the live theme accent, threaded to
 *  the count-up builder so its badge/history use the neutral accent label. */
function buildFromConfig(cfg: QuickTimerConfig, accentColor: string): WorkoutTemplate {
  switch (cfg.kind) {
    case 'countup':
      return buildCountupAdhoc(cfg.items, accentColor);
    case 'juarez':
      return buildJuarezAdhoc(cfg.juarezStartingReps!, cfg.juarezSuperset ?? false, cfg.items);
    case 'emom':
      return buildEmomAdhoc(cfg.emomMinutes!, cfg.items);
    case 'pr':
      return buildPrAdhoc(cfg.targetReps ?? 1, cfg.items);
  }
}

export default function ExecutionScreen() {
  const { templates, activeWorkoutIds, saveLog, exercises } = useAppContext();
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const activeTemplates = templates.filter((t) => activeWorkoutIds.includes(t.id));
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  // Ad-hoc (quick-timer) template — when set, takes precedence over the selected
  // real template so the execution engine runs the on-the-fly workout. Cleared
  // when the workout finishes/is discarded, returning to the normal selector.
  const [adhocTemplate, setAdhocTemplate] = useState<WorkoutTemplate | null>(null);
  // Which quick-timer config modal is open (countup / juarez / emom), or null
  // when closed. Opening it lets the user configure the timer before starting.
  const [configKind, setConfigKind] = useState<QuickTimerKind | null>(null);
  const template = adhocTemplate ?? templates.find(
    (t) => t.id === (selectedTemplateId ?? activeTemplates[0]?.id),
  ) ?? null;

  // ── Phase & step state ──────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle');
  const [blockIdx, setBlockIdx] = useState(0);
  const [manualIdx, setManualIdx] = useState(0);
  const [manualSetIdx, setManualSetIdx] = useState(0);
  const [restSeconds, setRestSeconds] = useState(0);
  const [emomStep, setEmomStep] = useState(0);
  const [emomSeconds, setEmomSeconds] = useState(60);
  // Per-block completion / skipped tracking
  const [completedByBlock, setCompletedByBlock] = useState<Record<string, number[]>>({});
  const [skippedByBlock, setSkippedByBlock] = useState<Record<string, number[]>>({});
  const [emomCompletedByBlock, setEmomCompletedByBlock] = useState<Record<string, number>>({});
  const [emomSkippedByBlock, setEmomSkippedByBlock] = useState<Record<string, number[]>>({});
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [workoutEndedAt, setWorkoutEndedAt] = useState<Date | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [note, setNote] = useState('');
  const [detailExerciseName, setDetailExerciseName] = useState<string | null>(null);
  const pausedForDetailRef = useRef(false);
  // Duration exercise timer
  const [exerciseTimerSeconds, setExerciseTimerSeconds] = useState(0);
  // True while a duration (countdown OR count-up) exercise timer is running.
  // Decoupled from `exerciseTimerSeconds` because count-up legitimately sits at
  // 0 (its starting value) — keying "active" off seconds>0 would never start it.
  const [exerciseTimerActive, setExerciseTimerActive] = useState(false);
  // Actual reps/weights/durations per exercise (key: `${blockId}-${idx}` or `-L`/`-R` suffix)
  const [actualReps, setActualReps] = useState<Record<string, number>>({});
  const [actualWeights, setActualWeights] = useState<Record<string, number>>({});
  const [actualDurations, setActualDurations] = useState<Record<string, number>>({});
  // Inline edit field
  const [editingField, setEditingField] = useState<'reps' | 'weight' | null>(null);
  // Which completion-screen review row is expanded
  const [reviewExpandedKey, setReviewExpandedKey] = useState<string | null>(null);
  // Alarm
  const [alarmNotifId, setAlarmNotifId] = useState<string | null>(null);
  const [alarmCountdownSecs, setAlarmCountdownSecs] = useState<number | null>(null);
  const [alarmCountdownPaused, setAlarmCountdownPaused] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmCountdownSecsRef = useRef<number>(0);
  // Wall-clock timestamp (ms) when the running alarm is due to fire; null while
  // paused or inactive. Mirrors the persisted `fireAt` so the on-screen countdown
  // can be snapped back to the true remaining time when the app returns to the
  // foreground (JS intervals are suspended while backgrounded).
  const alarmFireAtRef = useRef<number | null>(null);
  // Fresh-value mirror of `alarmCountdownPaused` so the AppState foreground
  // re-sync closure (registered once on mount) sees the current paused state
  // instead of a stale initial value.
  const alarmCountdownPausedRef = useRef(false);
  const phaseRef = useRef(phase);
  const blockIdxRef = useRef(blockIdx);
  const emomSecondsRef = useRef(emomSeconds);
  const restSecondsRef = useRef(restSeconds);
  const exerciseTimerSecondsRef = useRef(0);
  const exerciseTimerActiveRef = useRef(false);
  const restTypeRef = useRef<'sets' | 'exercises'>('exercises');
  // Wall-clock timestamp (ms) when the current rest ends; null when not resting.
  // Used so the rest countdown stays correct when the app is backgrounded (JS
  // intervals are suspended by the OS) and drives the "rest over" notification.
  const restEndsAtRef = useRef<number | null>(null);
  const [restNotifId, setRestNotifId] = useState<string | null>(null);
  const restNotifIdRef = useRef<string | null>(null);
  restNotifIdRef.current = restNotifId;
  const savedStateRef = useRef<SavedState | null>(null);
  const savingRef = useRef(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const soundWarningRef = useRef<Audio.Sound | null>(null);
  const soundTickRef = useRef<Audio.Sound | null>(null);
  // Fresh-value refs for timer callback (avoids stale closures)
  const manualIdxRef = useRef(manualIdx);
  const manualSetIdxRef = useRef(manualSetIdx);
  const templateRef = useRef(template);

  phaseRef.current = phase;
  blockIdxRef.current = blockIdx;
  emomSecondsRef.current = emomSeconds;
  restSecondsRef.current = restSeconds;
  manualIdxRef.current = manualIdx;
  manualSetIdxRef.current = manualSetIdx;
  templateRef.current = template;

  // ── Keep screen awake during workout ───────────────────────────────────────
  const isActive = phase !== 'idle' && phase !== 'done' && phase !== 'stopped';

  // ── Load sounds ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let warning: Audio.Sound | null = null;
    let tick: Audio.Sound | null = null;
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        ({ sound: warning } = await Audio.Sound.createAsync(
          require('../../assets/beep-warning.wav'),
        ));
        ({ sound: tick } = await Audio.Sound.createAsync(
          require('../../assets/beep-tick.wav'),
        ));
        soundWarningRef.current = warning;
        soundTickRef.current = tick;
      } catch {
        // Audio optional
      }
    })();
    return () => {
      warning?.unloadAsync().catch(() => {});
      tick?.unloadAsync().catch(() => {});
    };
  }, []);

  const playWarning = useCallback(async () => {
    try { await soundWarningRef.current?.replayAsync(); } catch {}
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, []);

  const playTick = useCallback(async () => {
    try { await soundTickRef.current?.replayAsync(); } catch {}
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, []);

  // ── Stop timer ──────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stopAlarmInterval = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  }, []);

  // ── Stop the exercise duration timer (countdown or count-up) ────────────────
  // Centralizes the 3 things every stop site must do: clear the interval, zero
  // the seconds, and clear the `active` flag (which is what the UI keys on,
  // since a count-up timer legitimately reads 0 while running).
  const stopExerciseTimer = () => {
    stopTimer();
    setExerciseTimerSeconds(0);
    exerciseTimerSecondsRef.current = 0;
    setExerciseTimerActive(false);
    exerciseTimerActiveRef.current = false;
  };

  // ── Start timer ─────────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    stopTimer();
    intervalRef.current = setInterval(() => {
      const p = phaseRef.current;

      if (p === 'rest') {
        // Wall-clock-correct remaining seconds. Falls back to tick decrement
        // only if no end timestamp was set (defensive).
        const s = restEndsAtRef.current != null
          ? Math.max(0, Math.ceil((restEndsAtRef.current - Date.now()) / 1000))
          : restSecondsRef.current - 1;
        if (s > 0 && s % 30 === 0) { playWarning(); }
        if (s > 0 && s <= 3) { playTick(); }
        if (s <= 0) {
          setRestSeconds(0);
          restEndsAtRef.current = null;
          cancelRestOverNotification(restNotifIdRef.current);
          setRestNotifId(null);
          restNotifIdRef.current = null;
          stopTimer();
          if (restTypeRef.current === 'sets') {
            setManualSetIdx((si) => si + 1);
          } else {
            setManualIdx((i) => i + 1);
            setManualSetIdx(0);
          }
          setPhase('exercise');
        } else {
          setRestSeconds(s);
        }
      } else if (p === 'emom') {
        const s = emomSecondsRef.current - 1;
        if (s > 0 && s % 30 === 0) { playWarning(); }
        if (s > 0 && s <= 3) { playTick(); }
        if (s <= 0) {
          setEmomSeconds(60);
          setEmomStep((step) => step + 1);
          const blkId = templateRef.current?.blocks[blockIdxRef.current]?.id ?? '';
          setEmomCompletedByBlock((prev) => ({ ...prev, [blkId]: (prev[blkId] ?? 0) + 1 }));
        } else {
          setEmomSeconds(s);
        }
      } else if (p === 'exercise' && exerciseTimerActiveRef.current) {
        // Duration-based exercise timer. Direction depends on execution type:
        // countdown ticks DOWN and auto-finishes at 0; countup ticks UP and is
        // stopped manually (max-effort holds like a dead hang).
        const tmpl0 = templateRef.current;
        const curItem = tmpl0?.blocks[blockIdxRef.current]?.items[manualIdxRef.current];
        const isCountup = curItem ? getExecutionType(curItem) === 'countup' : false;
        if (isCountup) {
          // Count up — never auto-finish. Warning tick every 30s for feedback.
          const s = exerciseTimerSecondsRef.current + 1;
          if (s > 0 && s % 30 === 0) { playWarning(); }
          setExerciseTimerSeconds(s);
          exerciseTimerSecondsRef.current = s;
          return;
        }
        // Countdown
        const s = exerciseTimerSecondsRef.current - 1;
        if (s > 0 && s % 30 === 0) { playWarning(); }
        if (s > 0 && s <= 3) { playTick(); }
        if (s <= 0) {
          // Countdown reached zero → finish this set/exercise.
          setExerciseTimerSeconds(0);
          exerciseTimerSecondsRef.current = 0;
          setExerciseTimerActive(false);
          exerciseTimerActiveRef.current = false;
          stopTimer();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          const tmpl = templateRef.current;
          const blkIdx = blockIdxRef.current;
          const idx = manualIdxRef.current;
          const setIdx = manualSetIdxRef.current;
          if (!tmpl) return;
          const block = tmpl.blocks[blkIdx];
          if (!block) return;
          const item = block.items[idx];
          if (!item) return;
          const totalSets = item.sets ?? 1;
          const isLastSet = setIdx >= totalSets - 1;
          if (isLastSet) {
            setCompletedByBlock((prev) => ({
              ...prev,
              [block.id]: [...(prev[block.id] ?? []), idx],
            }));
          }
          if (item.restTime > 0) {
            const nextLabel = isLastSet
              ? (block.items[idx + 1]?.exerciseName || 'next exercise')
              : `${item.exerciseName} (set ${setIdx + 2})`;
            beginRest(item.restTime, isLastSet ? 'exercises' : 'sets', nextLabel);
          } else {
            if (isLastSet) {
              setManualIdx((i) => i + 1);
              setManualSetIdx(0);
            } else {
              setManualSetIdx((si) => si + 1);
            }
          }
        } else {
          setExerciseTimerSeconds(s);
          exerciseTimerSecondsRef.current = s;
        }
      }
    }, 1000);
  }, [stopTimer, playWarning, playTick]);

  // ── Begin a rest period ─────────────────────────────────────────────────────
  // Sets the wall-clock end timestamp (so the countdown survives backgrounding),
  // seeds the display, and schedules a local "rest over" notification that fires
  // even if the user has switched to another app.
  const beginRest = (seconds: number, type: 'sets' | 'exercises', nextLabel: string) => {
    setRestSeconds(seconds);
    restSecondsRef.current = seconds;
    restEndsAtRef.current = Date.now() + seconds * 1000;
    restTypeRef.current = type;
    setPhase('rest');
    startTimer();
    // Cancel any previous (shouldn't exist) before scheduling a new one.
    cancelRestOverNotification(restNotifIdRef.current);
    scheduleRestOverNotification(seconds, nextLabel).then((id) => {
      setRestNotifId(id);
      restNotifIdRef.current = id;
    });
  };

  // ── End the rest period immediately (skip or natural end) ───────────────────
  // Clears the timestamp + notification, then advances to the next set/exercise.
  const endRestNow = () => {
    restEndsAtRef.current = null;
    cancelRestOverNotification(restNotifIdRef.current);
    setRestNotifId(null);
    restNotifIdRef.current = null;
    stopTimer();
    if (restTypeRef.current === 'sets') {
      setManualSetIdx((si) => si + 1);
    } else {
      setManualIdx((i) => i + 1);
      setManualSetIdx(0);
    }
    setPhase('exercise');
  };

  // ── Tear down alarm state after it fires (or is cancelled) ──────────────────
  // Centralizes the full cleanup so every "alarm is over" path clears ALL the
  // pieces the UI keys on. Previously the fire sites only zeroed the countdown,
  // leaving `alarmNotifId` set — so the execution-screen indicator stayed up
  // (rendering the buggy "Alarm in undefined min" once the countdown hit 0) and
  // the idle-screen card lingered on "Alarm!". Clearing both makes the alarm
  // vanish everywhere the moment it fires.
  const finalizeAlarmFired = useCallback(() => {
    stopAlarmInterval();
    alarmFireAtRef.current = null;
    setAlarmCountdownSecs(null);
    alarmCountdownSecsRef.current = 0;
    setAlarmCountdownPaused(false);
    alarmCountdownPausedRef.current = false;
    // Cancel the (possibly already-fired) OS notification + drop the id.
    setAlarmNotifId((id) => { if (id) cancelAlarm(id); return null; });
    // Clear persisted state so a later reopen doesn't restore a fired alarm.
    saveAlarmState(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [stopAlarmInterval]);

  const startAlarmInterval = useCallback(() => {
    stopAlarmInterval();
    alarmIntervalRef.current = setInterval(() => {
      // Wall-clock-correct remaining (JS intervals freeze while backgrounded):
      // when we have a fire timestamp, derive the countdown from `Date.now()`
      // instead of blindly subtracting one tick. Falls back to tick decrement
      // only if no timestamp was set (defensive — always set on start/resume).
      const s = alarmFireAtRef.current != null
        ? Math.max(0, Math.ceil((alarmFireAtRef.current - Date.now()) / 1000))
        : alarmCountdownSecsRef.current - 1;
      if (s <= 0) {
        // Alarm fired — tear everything down so the alarm fully disappears.
        finalizeAlarmFired();
      } else {
        setAlarmCountdownSecs(s);
        alarmCountdownSecsRef.current = s;
      }
    }, 1000);
  }, [stopAlarmInterval, finalizeAlarmFired]);

  // ── Auto-start duration exercise timer when entering a new exercise ─────────
  useEffect(() => {
    if (phase !== 'exercise') return;
    if (!template) return;
    const currentBlock = template.blocks[blockIdx];
    if (!currentBlock) return;
    const item = currentBlock.items[manualIdx];
    if (!item) return;
    const exType = getExecutionType(item);
    if (exType === 'countdown' || exType === 'countup') {
      if (exerciseTimerActiveRef.current) {
        // Already running (e.g. resuming) — just restart the interval.
        startTimer();
        return;
      }
      // countdown seeds from the target; countup seeds from 0.
      const seed = exType === 'countdown' ? (item.durationSeconds ?? 60) : 0;
      setExerciseTimerSeconds(seed);
      exerciseTimerSecondsRef.current = seed;
      setExerciseTimerActive(true);
      exerciseTimerActiveRef.current = true;
      startTimer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualIdx, manualSetIdx, phase, blockIdx]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => () => stopTimer(), [stopTimer]);
  useEffect(() => () => stopAlarmInterval(), [stopAlarmInterval]);

  // ── Restore alarm countdown on mount ────────────────────────────────────────
  // The OS-scheduled notification survives app close, but the in-memory countdown
  // state is lost. Recompute remaining seconds from the persisted fire timestamp
  // so the alarm card reappears with the correct time (and keeps ticking). The
  // alarm is a standalone countdown, so it is restored regardless of which
  // template is currently selected — after a full relaunch the picker selection
  // is gone and `template` may not be the one that started the alarm (or may be
  // null for an ad-hoc/quick-timer). Runs once on mount.
  const alarmRestoredRef = useRef(false);
  useEffect(() => {
    if (alarmRestoredRef.current) return;
    alarmRestoredRef.current = true;
    (async () => {
      const saved = await loadAlarmState();
      if (!saved) return;
      // Restore the notification id so the in-workout indicator and Cancel still
      // work, and so stop/finish can cancel the still-pending OS notification.
      if (saved.notifId) setAlarmNotifId(saved.notifId);
      if (saved.paused) {
        // Alarm was paused when the app closed — restore paused with its remaining.
        const remaining = Math.max(0, Math.round(saved.pausedRemainingSecs));
        alarmCountdownSecsRef.current = remaining;
        setAlarmCountdownSecs(remaining);
        setAlarmCountdownPaused(true);
        alarmCountdownPausedRef.current = true;
        alarmFireAtRef.current = null;
      } else {
        const remaining = Math.ceil((saved.fireAt - Date.now()) / 1000);
        if (remaining <= 0) {
          // Already fired while the app was closed — nothing left to show.
          saveAlarmState(null);
          setAlarmNotifId(null);
        } else {
          alarmCountdownSecsRef.current = remaining;
          setAlarmCountdownSecs(remaining);
          setAlarmCountdownPaused(false);
          alarmCountdownPausedRef.current = false;
          alarmFireAtRef.current = saved.fireAt;
          startAlarmInterval();
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Foreground re-sync: when returning to the app, recompute the displayed
  // countdowns from their wall-clock timestamps (JS intervals are suspended
  // while backgrounded, so the tick count drifted / froze). Handles both the
  // rest countdown and the alarm countdown:
  //  - rest: if it already ended while away (the "rest over" notification also
  //    fired), finish the rest now.
  //  - alarm: snap the displayed remaining to the true time; if it already
  //    fired while away, finalize it (the OS notification fired regardless).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;

      // Rest re-sync.
      if (phaseRef.current === 'rest' && restEndsAtRef.current != null) {
        const remaining = Math.ceil((restEndsAtRef.current - Date.now()) / 1000);
        if (remaining <= 0) {
          // Rest ended while backgrounded — advance to the next set/exercise.
          setRestSeconds(0);
          endRestNow();
        } else {
          // Snap the displayed countdown to the real remaining time.
          setRestSeconds(remaining);
          restSecondsRef.current = remaining;
        }
      }

      // Alarm re-sync (only when running, not paused). Without this the on-screen
      // countdown freezes while backgrounded even though the OS alarm still fires.
      if (alarmFireAtRef.current != null && !alarmCountdownPausedRef.current) {
        const remaining = Math.max(0, Math.ceil((alarmFireAtRef.current - Date.now()) / 1000));
        if (remaining <= 0) {
          // Alarm fired while the app was in the background — fully tear down so
          // the alarm disappears from both screens (see finalizeAlarmFired).
          finalizeAlarmFired();
        } else {
          setAlarmCountdownSecs(remaining);
          alarmCountdownSecsRef.current = remaining;
        }
      }
    });
    return () => sub.remove();
  }, [finalizeAlarmFired]);

  // ── Reset edit field when exercise changes ──────────────────────────────────
  useEffect(() => {
    setEditingField(null);
  }, [manualIdx, manualSetIdx, emomStep, phase]);

  // ── Watch emomStep: check if EMOM finished ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'emom' || !template) return;
    const currentBlock = template.blocks[blockIdx];
    if (!currentBlock || currentBlock.type !== 'emom') return;
    if (emomStep >= (currentBlock.emomMinutes ?? 0)) {
      stopTimer();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      advanceToNextBlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emomStep, blockIdx]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- manualIdx watcher
  useEffect(() => {
    if (phase !== 'exercise' || !template) return;
    const currentBlock = template.blocks[blockIdx];
    if (!currentBlock) return;
    // For Juarez blocks, the step count is the virtual round count, not the
    // number of items (which is 1 or 2).
    const stepLimit = currentBlock.type === 'juarez'
      ? juarezStepCount(currentBlock)
      : currentBlock.items.length;
    if (manualIdx >= stepLimit) {
      advanceToNextBlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualIdx, phase, blockIdx]);

  const advanceToNextBlock = useCallback(() => {
    if (!template) return;
    const nextIdx = blockIdx + 1;
    if (nextIdx >= template.blocks.length) {
      setWorkoutEndedAt(new Date());
      setPhase('done');
      // Cancel alarm when workout finishes naturally
      setAlarmNotifId((id) => { if (id) cancelAlarm(id); return null; });
      saveAlarmState(null);
      // Cancel any pending rest-over notification so it doesn't fire post-workout.
      cancelRestOverNotification(restNotifIdRef.current);
      setRestNotifId(null);
      restNotifIdRef.current = null;
      restEndsAtRef.current = null;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }
    setBlockIdx(nextIdx);
    const nextBlock = template.blocks[nextIdx];
    setManualIdx(0);
    setManualSetIdx(0);
    if (nextBlock.type === 'emom') {
      setEmomStep(0);
      setEmomSeconds(60);
      setPhase('emom');
      startTimer();
    } else {
      setPhase('exercise');
    }
  }, [template, blockIdx, startTimer]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────────

  const handleStart = (explicitTemplate?: WorkoutTemplate) => {
    const tpl = explicitTemplate ?? template;
    if (!tpl) return;
    const firstBlock = tpl.blocks[0];
    setStartedAt(new Date());
    setWorkoutEndedAt(null);
    setBlockIdx(0);
    setCompletedByBlock({});
    setSkippedByBlock({});
    setEmomCompletedByBlock({});
    setEmomSkippedByBlock({});
    setEmomStep(0);
    setEmomSeconds(60);
    setManualIdx(0);
    setManualSetIdx(0);
    setIsPaused(false);
    setNote('');
    setActualReps({});
    setActualWeights({});
    setActualDurations({});
    setEditingField(null);
    stopExerciseTimer();
    // Clear any leftover rest-over notification from a prior run.
    cancelRestOverNotification(restNotifIdRef.current);
    setRestNotifId(null);
    restNotifIdRef.current = null;
    restEndsAtRef.current = null;
    savedStateRef.current = null;
    savingRef.current = false;
    setHasSaved(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Alarm is started on demand via the "Start alarm" button, not when the
    // workout starts — so the countdown and its notification begin together
    // only when the user explicitly starts the alarm.
    if (!firstBlock) { setPhase('done'); return; }
    if (firstBlock.type === 'emom') {
      setPhase('emom');
      startTimer();
    } else {
      setPhase('exercise');
    }
  };

  // ── Start an ad-hoc (quick-timer) workout ──────────────────────────────────
  // Sets the synthetic template so the engine (and templateRef mirror) see it,
  // and passes it explicitly to handleStart so the workout begins this tick
  // rather than waiting for the state update to propagate.
  const startAdhoc = (adhoc: WorkoutTemplate) => {
    setAdhocTemplate(adhoc);
    handleStart(adhoc);
  };

  // ── Standalone alarm countdown actions ──────────────────────────────────────

  const handleStartAlarm = useCallback(async () => {
    if (!template?.alarmMinutes) return;
    const seconds = template.alarmMinutes * 60;
    alarmCountdownSecsRef.current = seconds;
    setAlarmCountdownSecs(seconds);
    setAlarmCountdownPaused(false);
    alarmCountdownPausedRef.current = false;
    const fireAt = Date.now() + seconds * 1000;
    alarmFireAtRef.current = fireAt;
    const id = await scheduleAlarm(template.alarmMinutes, template.name).catch(() => null);
    setAlarmNotifId(id);
    // Persist so the alarm card reappears (with the right remaining time) after
    // the app is closed and reopened — the OS notification fires regardless.
    saveAlarmState({ templateId: template.id, fireAt, paused: false, pausedRemainingSecs: 0, notifId: id });
    startAlarmInterval();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [template, startAlarmInterval]);

  const handlePauseAlarm = useCallback(() => {
    stopAlarmInterval();
    setAlarmCountdownPaused(true);
    alarmCountdownPausedRef.current = true;
    alarmFireAtRef.current = null; // freeze until resume
    setAlarmNotifId((id) => { if (id) cancelAlarm(id); return null; });
    // Persist the paused remaining so resume (even after app reopen) is correct.
    saveAlarmState({
      templateId: template?.id ?? '',
      fireAt: 0,
      paused: true,
      pausedRemainingSecs: Math.max(0, alarmCountdownSecsRef.current),
      notifId: null, // cancelled on pause; re-scheduled on resume
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [stopAlarmInterval, template]);

  const handleResumeAlarm = useCallback(() => {
    if (alarmCountdownSecsRef.current <= 0 || !template) return;
    setAlarmCountdownPaused(false);
    alarmCountdownPausedRef.current = false;
    const remaining = alarmCountdownSecsRef.current;
    const fireAt = Date.now() + remaining * 1000;
    alarmFireAtRef.current = fireAt;
    scheduleAlarm(remaining / 60, template.name).then((id) => {
      setAlarmNotifId(id);
    }).catch(() => {});
    saveAlarmState({ templateId: template.id, fireAt, paused: false, pausedRemainingSecs: 0, notifId: null });
    startAlarmInterval();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [template, startAlarmInterval]);

  const handleStopAlarm = useCallback(() => {
    stopAlarmInterval();
    alarmFireAtRef.current = null;
    setAlarmCountdownSecs(null);
    alarmCountdownSecsRef.current = 0;
    setAlarmCountdownPaused(false);
    alarmCountdownPausedRef.current = false;
    setAlarmNotifId((id) => { if (id) cancelAlarm(id); return null; });
    saveAlarmState(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [stopAlarmInterval]);

  const handleManualDone = () => {
    if (!template) return;
    const currentBlock = template.blocks[blockIdx];
    if (!currentBlock) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    stopExerciseTimer();

    // ── Juarez Valley: each step is one performance. No sets — every tap
    // advances to the next step. Rest uses the first item's restTime.
    if (currentBlock.type === 'juarez') {
      const totalSteps = juarezStepCount(currentBlock);
      const isLastStep = manualIdx >= totalSteps - 1;
      // Mark this step as completed.
      setCompletedByBlock((prev) => ({
        ...prev,
        [currentBlock.id]: [...(prev[currentBlock.id] ?? []), manualIdx],
      }));
      if (isLastStep) {
        // Last performance of the block → advance (to next block, or finish the
        // workout if this was the last block). Done directly because we don't
        // increment manualIdx past the limit (which is what the watcher keys on).
        advanceToNextBlock();
        return;
      }
      const firstItem = currentBlock.items[0];
      const rest = firstItem?.restTime ?? 0;
      if (rest > 0) {
        const nextStep = manualIdx + 1;
        const nextItemIdx = juarezStepInfo(nextStep, currentBlock).itemIdx;
        const nextLabel = currentBlock.items[nextItemIdx]?.exerciseName || `Round ${nextStep + 1}`;
        beginRest(rest, 'exercises', nextLabel);
      } else {
        setManualIdx((i) => i + 1);
      }
      return;
    }

    const item = currentBlock.items[manualIdx];
    if (!item) return;
    const totalSets = item.sets ?? 1;
    const isLastSet = manualSetIdx >= totalSets - 1;
    if (isLastSet) {
      setCompletedByBlock((prev) => ({
        ...prev,
        [currentBlock.id]: [...(prev[currentBlock.id] ?? []), manualIdx],
      }));
    }
    if (item.restTime > 0) {
      const nextLabel = isLastSet
        ? (currentBlock.items[manualIdx + 1]?.exerciseName || 'next exercise')
        : `${item.exerciseName} (set ${manualSetIdx + 2})`;
      beginRest(item.restTime, isLastSet ? 'exercises' : 'sets', nextLabel);
    } else {
      if (isLastSet) {
        setManualIdx((i) => i + 1);
        setManualSetIdx(0);
      } else {
        setManualSetIdx((si) => si + 1);
      }
    }
  };

  // ── Stop a count-up timer: record the elapsed seconds, then advance using the
  // same sets/rest/next-item logic as handleManualDone. (Mirrors its tail.)
  const handleStopTimer = () => {
    if (!template) return;
    const currentBlock = template.blocks[blockIdx];
    if (!currentBlock) return;
    const item = currentBlock.items[manualIdx];
    if (!item) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Record the actual elapsed seconds for this performance.
    const elapsed = exerciseTimerSecondsRef.current;
    const key = `${currentBlock.id}-${manualIdx}`;
    setActualDurations((prev) => ({ ...prev, [key]: elapsed }));
    // Stop the timer.
    stopExerciseTimer();

    const totalSets = item.sets ?? 1;
    const isLastSet = manualSetIdx >= totalSets - 1;
    if (isLastSet) {
      setCompletedByBlock((prev) => ({
        ...prev,
        [currentBlock.id]: [...(prev[currentBlock.id] ?? []), manualIdx],
      }));
    }
    if (item.restTime > 0) {
      const nextLabel = isLastSet
        ? (currentBlock.items[manualIdx + 1]?.exerciseName || 'next exercise')
        : `${item.exerciseName} (set ${manualSetIdx + 2})`;
      beginRest(item.restTime, isLastSet ? 'exercises' : 'sets', nextLabel);
    } else {
      if (isLastSet) {
        setManualIdx((i) => i + 1);
        setManualSetIdx(0);
      } else {
        setManualSetIdx((si) => si + 1);
      }
    }
  };

  // Skip current exercise entirely (no rest, not marked completed)
  const handleSkipExercise = () => {
    if (!template) return;
    const currentBlock = template.blocks[blockIdx];
    if (currentBlock) {
      setSkippedByBlock((prev) => ({
        ...prev,
        [currentBlock.id]: [...(prev[currentBlock.id] ?? []), manualIdx],
      }));
    }
    stopExerciseTimer();
    setManualIdx((i) => i + 1);
    setManualSetIdx(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  // Skip current EMOM minute (advance to next immediately)
  const handleSkipEmomStep = () => {
    if (!template) return;
    const currentBlock = template.blocks[blockIdx];
    if (currentBlock) {
      setEmomSkippedByBlock((prev) => ({
        ...prev,
        [currentBlock.id]: [...(prev[currentBlock.id] ?? []), emomStep],
      }));
      setEmomCompletedByBlock((prev) => ({
        ...prev,
        [currentBlock.id]: (prev[currentBlock.id] ?? 0) + 1,
      }));
    }
    stopTimer();
    setEmomSeconds(60);
    emomSecondsRef.current = 60;
    setEmomStep((step) => step + 1);
    startTimer();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  // Go back to the previous exercise
  const handlePreviousExercise = () => {
    if (!template) return;
    const currentBlock = template.blocks[blockIdx];
    stopExerciseTimer();
    if (manualIdx > 0) {
      const prevIdx = manualIdx - 1;
      setManualIdx(prevIdx);
      setManualSetIdx(0);
      if (currentBlock) {
        setCompletedByBlock((prev) => ({ ...prev, [currentBlock.id]: (prev[currentBlock.id] ?? []).filter((i) => i !== prevIdx) }));
        setSkippedByBlock((prev) => ({ ...prev, [currentBlock.id]: (prev[currentBlock.id] ?? []).filter((i) => i !== prevIdx) }));
      }
    } else if (blockIdx > 0) {
      const prevBlock = template.blocks[blockIdx - 1];
      setBlockIdx(blockIdx - 1);
      if (prevBlock.type === 'emom') {
        const lastStep = (prevBlock.emomMinutes ?? 1) - 1;
        setEmomStep(lastStep);
        setEmomSeconds(60);
        emomSecondsRef.current = 60;
        setEmomCompletedByBlock((prev) => ({ ...prev, [prevBlock.id]: Math.max(0, (prev[prevBlock.id] ?? 0) - 1) }));
        setPhase('emom');
        startTimer();
      } else {
        const lastIdx = prevBlock.items.length - 1;
        setManualIdx(lastIdx);
        setManualSetIdx(0);
        setCompletedByBlock((prev) => ({ ...prev, [prevBlock.id]: (prev[prevBlock.id] ?? []).filter((i) => i !== lastIdx) }));
        setSkippedByBlock((prev) => ({ ...prev, [prevBlock.id]: (prev[prevBlock.id] ?? []).filter((i) => i !== lastIdx) }));
        setPhase('exercise');
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  // Go back to the previous EMOM minute
  const handlePreviousEmomStep = () => {
    if (!template) return;
    const currentBlock = template.blocks[blockIdx];
    stopTimer();
    if (emomStep > 0) {
      const prevStep = emomStep - 1;
      setEmomStep(prevStep);
      setEmomSeconds(60);
      emomSecondsRef.current = 60;
      if (currentBlock) {
        setEmomCompletedByBlock((prev) => ({ ...prev, [currentBlock.id]: Math.max(0, (prev[currentBlock.id] ?? 0) - 1) }));
        setEmomSkippedByBlock((prev) => ({ ...prev, [currentBlock.id]: (prev[currentBlock.id] ?? []).filter((s) => s !== prevStep) }));
      }
      startTimer();
    } else if (blockIdx > 0) {
      const prevBlock = template.blocks[blockIdx - 1];
      setBlockIdx(blockIdx - 1);
      if (prevBlock.type === 'emom') {
        const lastStep = (prevBlock.emomMinutes ?? 1) - 1;
        setEmomStep(lastStep);
        setEmomSeconds(60);
        emomSecondsRef.current = 60;
        setEmomCompletedByBlock((prev) => ({ ...prev, [prevBlock.id]: Math.max(0, (prev[prevBlock.id] ?? 0) - 1) }));
        setPhase('emom');
        startTimer();
      } else {
        const lastIdx = prevBlock.items.length - 1;
        setManualIdx(lastIdx);
        setManualSetIdx(0);
        setCompletedByBlock((prev) => ({ ...prev, [prevBlock.id]: (prev[prevBlock.id] ?? []).filter((i) => i !== lastIdx) }));
        setSkippedByBlock((prev) => ({ ...prev, [prevBlock.id]: (prev[prevBlock.id] ?? []).filter((i) => i !== lastIdx) }));
        setPhase('exercise');
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleSkipRest = () => {
    endRestNow();
  };

  const handleTogglePause = () => {
    if (isPaused) {
      setIsPaused(false);
      // Resuming a rest: recompute the end timestamp from the remaining seconds
      // (the timestamp was frozen on pause) and re-schedule the notification.
      if (phaseRef.current === 'rest') {
        restEndsAtRef.current = Date.now() + Math.max(0, restSecondsRef.current) * 1000;
        cancelRestOverNotification(restNotifIdRef.current);
        scheduleRestOverNotification(Math.max(1, restSecondsRef.current), '').then((id) => {
          setRestNotifId(id);
          restNotifIdRef.current = id;
        });
      }
      startTimer();
    } else {
      setIsPaused(true);
      // Pausing a rest: freeze the end timestamp so it doesn't elapse while
      // paused, and cancel the pending notification (re-scheduled on resume).
      if (phaseRef.current === 'rest') {
        restEndsAtRef.current = null;
        cancelRestOverNotification(restNotifIdRef.current);
        setRestNotifId(null);
        restNotifIdRef.current = null;
      }
      stopTimer();
    }
  };

  const openDetail = (name: string) => {
    setDetailExerciseName(name);
    const timerIsRunning =
      (phase === 'rest' || phase === 'emom' || (phase === 'exercise' && exerciseTimerActiveRef.current)) &&
      !isPaused;
    if (timerIsRunning) {
      setIsPaused(true);
      // Freeze a running rest so it doesn't elapse while the detail modal is open.
      if (phase === 'rest') {
        restEndsAtRef.current = null;
        cancelRestOverNotification(restNotifIdRef.current);
        setRestNotifId(null);
        restNotifIdRef.current = null;
      }
      stopTimer();
      pausedForDetailRef.current = true;
    }
  };

  const closeDetail = () => {
    setDetailExerciseName(null);
    if (pausedForDetailRef.current) {
      pausedForDetailRef.current = false;
      setIsPaused(false);
      // Resume a frozen rest: recompute the end timestamp + re-schedule notif.
      if (phaseRef.current === 'rest') {
        restEndsAtRef.current = Date.now() + Math.max(0, restSecondsRef.current) * 1000;
        scheduleRestOverNotification(Math.max(1, restSecondsRef.current), '').then((id) => {
          setRestNotifId(id);
          restNotifIdRef.current = id;
        });
      }
      startTimer();
    }
  };

  const handleStop = () => {
    // Cancel any scheduled alarm
    if (alarmNotifId) { cancelAlarm(alarmNotifId); setAlarmNotifId(null); }
    saveAlarmState(null);
    // Cancel a pending rest-over notification (re-scheduled on resume if needed)
    cancelRestOverNotification(restNotifIdRef.current);
    setRestNotifId(null);
    restNotifIdRef.current = null;
    savedStateRef.current = {
      phase,
      blockIdx,
      manualIdx,
      manualSetIdx,
      restSeconds,
      restEndsAt: restEndsAtRef.current,
      emomStep,
      emomSeconds,
      exerciseTimerSeconds: exerciseTimerSecondsRef.current,
      exerciseTimerActive: exerciseTimerActiveRef.current,
    };
    stopTimer();
    setIsPaused(false);
    setWorkoutEndedAt(new Date());
    setPhase('stopped');
  };

  const handleResume = () => {
    const saved = savedStateRef.current;
    if (!saved) return;
    setPhase(saved.phase);
    setBlockIdx(saved.blockIdx);
    setManualIdx(saved.manualIdx);
    setManualSetIdx(saved.manualSetIdx);
    setRestSeconds(saved.restSeconds);
    restSecondsRef.current = saved.restSeconds;
    setEmomStep(saved.emomStep);
    setEmomSeconds(saved.emomSeconds);
    setIsPaused(false);
    exerciseTimerSecondsRef.current = saved.exerciseTimerSeconds;
    exerciseTimerActiveRef.current = saved.exerciseTimerActive;
    setExerciseTimerSeconds(saved.exerciseTimerSeconds);
    setExerciseTimerActive(saved.exerciseTimerActive);
    if (saved.exerciseTimerActive) {
      // restart the duration timer (countdown or count-up) on resume
      startTimer();
    }
    // Resuming into rest: recompute the end timestamp from the remaining seconds
    // (time passed while stopped, so the old timestamp is stale) and re-schedule
    // the rest-over notification.
    if (saved.phase === 'rest') {
      restEndsAtRef.current = Date.now() + Math.max(0, saved.restSeconds) * 1000;
      scheduleRestOverNotification(Math.max(1, saved.restSeconds), '').then((id) => {
        setRestNotifId(id);
        restNotifIdRef.current = id;
      });
      startTimer();
    } else if (saved.phase === 'emom') {
      startTimer();
    }
    savedStateRef.current = null;
    setWorkoutEndedAt(null);
  };

  const handleDiscard = () => {
    savedStateRef.current = null;
    stopTimer();
    setAdhocTemplate(null);
    // Cancel any pending rest-over notification so it doesn't fire after discard.
    cancelRestOverNotification(restNotifIdRef.current);
    setRestNotifId(null);
    restNotifIdRef.current = null;
    restEndsAtRef.current = null;
    setPhase('idle');
    setNote('');
    setActualReps({});
    setActualWeights({});
    setActualDurations({});
    setCompletedByBlock({});
    setSkippedByBlock({});
    setEmomCompletedByBlock({});
    setEmomSkippedByBlock({});
    setEditingField(null);
    stopExerciseTimer();
  };

  const confirmLog = async () => {
    if (!template || !startedAt) return;
    const endedAt = new Date();
    const hasSkipped =
      Object.values(skippedByBlock).some((arr) => arr.length > 0) ||
      Object.values(emomSkippedByBlock).some((arr) => arr.length > 0);
    const isPartial = phase === 'stopped' || hasSkipped;
    const itemLogs: ItemLog[] = [];

    template.blocks.forEach((block) => {
      if (block.type === 'emom') {
        const emomMinutes = block.emomMinutes ?? 0;
        const completedSteps = isPartial ? (emomCompletedByBlock[block.id] ?? 0) : emomMinutes;
        const skippedSteps = emomSkippedByBlock[block.id] ?? [];
        for (let step = 0; step < emomMinutes; step++) {
          const item = block.items[step % block.items.length];
          if (!item) continue;
          const key = `${block.id}-${step}`;
          itemLogs.push({
            id: generateId(),
            blockId: block.id,
            blockType: block.type,
            customLabel: block.customLabel,
            customColor: block.customColor,
            exerciseName: item.exerciseName,
            reps: actualReps[key] ?? item.reps,
            repsLeft: item.repMode !== 'bilateral' ? (actualReps[`${key}-L`] ?? item.reps) : undefined,
            repsRight: item.repMode !== 'bilateral' ? (actualReps[`${key}-R`] ?? item.reps) : undefined,
            weight: actualWeights[key] ?? item.weight,
            repMode: item.repMode,
            completed: step < completedSteps,
            skipped: skippedSteps.includes(step),
            emomMinute: step + 1,
          });
        }
      } else if (block.type === 'juarez') {
        // Expand each Juarez performance into one ItemLog. Each step is one
        // exercise + one rep count from the ladder/pyramid sequence.
        const totalSteps = juarezStepCount(block);
        const completedIdx = completedByBlock[block.id] ?? [];
        const skippedIdx = skippedByBlock[block.id] ?? [];
        for (let step = 0; step < totalSteps; step++) {
          const { itemIdx, reps, round } = juarezStepInfo(step, block);
          const item = block.items[itemIdx];
          if (!item) continue;
          const key = `${block.id}-${step}`;
          itemLogs.push({
            id: generateId(),
            blockId: block.id,
            blockType: block.type,
            customLabel: block.customLabel,
            customColor: block.customColor,
            exerciseName: item.exerciseName,
            reps: actualReps[key] ?? reps,
            repsLeft: item.repMode !== 'bilateral' ? (actualReps[`${key}-L`] ?? reps) : undefined,
            repsRight: item.repMode !== 'bilateral' ? (actualReps[`${key}-R`] ?? reps) : undefined,
            weight: actualWeights[key] ?? item.weight,
            repMode: item.repMode,
            completed: !isPartial || completedIdx.includes(step),
            skipped: skippedIdx.includes(step),
            juarezRound: round + 1,
          });
        }
      } else {
        const completedIdx = completedByBlock[block.id] ?? [];
        const skippedIdx = skippedByBlock[block.id] ?? [];
        block.items.forEach((item, idx) => {
          const key = `${block.id}-${idx}`;
          const exType = getExecutionType(item);
          itemLogs.push({
            id: generateId(),
            blockId: block.id,
            blockType: block.type,
            customLabel: block.customLabel,
            customColor: block.customColor,
            exerciseName: item.exerciseName,
            reps: actualReps[key] ?? item.reps,
            repsLeft: item.repMode !== 'bilateral' ? (actualReps[`${key}-L`] ?? item.reps) : undefined,
            repsRight: item.repMode !== 'bilateral' ? (actualReps[`${key}-R`] ?? item.reps) : undefined,
            weight: actualWeights[key] ?? item.weight,
            repMode: item.repMode,
            completed: !isPartial || completedIdx.includes(idx),
            skipped: skippedIdx.includes(idx),
            // For duration items, record performed seconds (actual or planned).
            durationSeconds: exType !== 'reps' ? (actualDurations[key] ?? item.durationSeconds) : undefined,
          });
        });
      }
    });

    const log: WorkoutLog = {
      id: generateId(),
      templateId: template.id,
      workoutName: template.name,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      totalDurationSeconds: Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
      note,
      isPartial,
      itemLogs,
    };

    if (savingRef.current) return; // guard against double-tap duplicates
    savingRef.current = true;
    setSaveError(null);
    let ok = false;
    try {
      await saveLog(log);
      ok = true;
    } catch (e) {
      // Don't re-throw — confirmLog is an async onPress handler, so a re-throw
      // becomes an unhandled rejection and setHasSaved(true) below never runs,
      // leaving the button looking frozen ("does not work"). Surface the failure
      // instead so the user can retry.
      console.warn('saveLog failed', e);
      setSaveError('Could not save — check your connection and try again.');
    } finally {
      savingRef.current = false;
    }
    if (!ok) return;
    setHasSaved(true);
    savedStateRef.current = null;
    stopTimer();
    setAdhocTemplate(null);
    setPhase('idle');
    setNote('');
    setActualReps({});
    setActualWeights({});
    setActualDurations({});
    setCompletedByBlock({});
    setSkippedByBlock({});
    setEmomCompletedByBlock({});
    setEmomSkippedByBlock({});
    setEditingField(null);
    stopExerciseTimer();
    cancelRestOverNotification(restNotifIdRef.current);
    setRestNotifId(null);
    restNotifIdRef.current = null;
    restEndsAtRef.current = null;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Derived display values
  // ─────────────────────────────────────────────────────────────────────────────

  const currentBlock = template?.blocks[blockIdx] ?? null;

  const currentItem: WorkoutItem | null = (() => {
    if (!currentBlock) return null;
    if (phase === 'exercise' || phase === 'rest') {
      // Juarez Valley: map the step index to the right exercise + override reps.
      if (currentBlock.type === 'juarez') {
        const { itemIdx, reps } = juarezStepInfo(manualIdx, currentBlock);
        const baseItem = currentBlock.items[itemIdx];
        if (!baseItem) return null;
        return { ...baseItem, reps };
      }
      return currentBlock.items[manualIdx] ?? null;
    }
    if (phase === 'emom') {
      return currentBlock.items[emomStep % currentBlock.items.length] ?? null;
    }
    return null;
  })();

  const progressText = (() => {
    if (!currentBlock) return '';
    if (phase === 'exercise' || phase === 'rest') {
      // Juarez Valley: show round progress instead of item/set progress.
      if (currentBlock.type === 'juarez') {
        const totalRounds = juarezStepCount(currentBlock);
        const roundNum = Math.min(manualIdx + 1, totalRounds);
        return `ROUND ${roundNum} / ${totalRounds}`;
      }
      const item = currentBlock.items[manualIdx];
      const totalSets = item?.sets ?? 1;
      const base = `${Math.min(manualIdx + 1, currentBlock.items.length)} / ${currentBlock.items.length}`;
      return totalSets > 1 ? `${base} · Set ${manualSetIdx + 1}/${totalSets}` : base;
    }
    if (phase === 'emom') {
      return `MIN ${emomStep + 1} / ${currentBlock.emomMinutes}`;
    }
    return '';
  })();

  const emomProgress = currentBlock?.type === 'emom' ? emomStep / (currentBlock.emomMinutes ?? 1) : 0;
  const juarezProgress = currentBlock?.type === 'juarez'
    ? (manualIdx + 1) / juarezStepCount(currentBlock)
    : 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Execution</Text>
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.idleScrollContent}>
          {/* ── Quick timers (ad-hoc workouts) ── */}
          <View style={styles.quickTimersRow}>
            <TouchableOpacity
              style={[styles.quickTimerBtn, { backgroundColor: `${colors.accent}22`, borderColor: `${colors.accent}55` }]}
              onPress={() => setConfigKind('countup')}
              activeOpacity={0.8}
            >
              <Ionicons name="stopwatch-outline" size={20} color={colors.accent} />
              <Text style={[styles.quickTimerBtnText, { color: colors.accent }]}>Count-up</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickTimerBtn, { backgroundColor: '#2DD4BF22', borderColor: '#2DD4BF55' }]}
              onPress={() => setConfigKind('juarez')}
              activeOpacity={0.8}
            >
              <Ionicons name="trending-down-outline" size={20} color="#2DD4BF" />
              <Text style={[styles.quickTimerBtnText, { color: '#2DD4BF' }]}>Juarez</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickTimerBtn, { backgroundColor: '#FBBF2422', borderColor: '#FBBF2444' }]}
              onPress={() => setConfigKind('emom')}
              activeOpacity={0.8}
            >
              <Ionicons name="repeat-outline" size={20} color="#FBBF24" />
              <Text style={[styles.quickTimerBtnText, { color: '#FBBF24' }]}>EMOM</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickTimerBtn, { backgroundColor: `${colors.success}22`, borderColor: `${colors.success}55` }]}
              onPress={() => setConfigKind('pr')}
              activeOpacity={0.8}
            >
              <Ionicons name="trophy-outline" size={20} color={colors.success} />
              <Text style={[styles.quickTimerBtnText, { color: colors.success }]}>PR</Text>
            </TouchableOpacity>
          </View>

          {/* ── Workout picker (only when there are active templates) ── */}
          {activeTemplates.length > 0 && template && (
            <>
              <View style={styles.pickerSection}>
                {activeTemplates.length > 1 && (
                  <Text style={styles.pickerSectionLabel}>CHOOSE WORKOUT</Text>
                )}
                {activeTemplates.map((t) => {
                  const isSelected = t.id === (selectedTemplateId ?? activeTemplates[0].id);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
                      onPress={() => setSelectedTemplateId(t.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={isSelected ? colors.accent : colors.textTertiary}
                      />
                      <Text style={[styles.pickerRowText, isSelected && { color: colors.accent }]}>
                        {t.name}
                      </Text>
                      <Text style={styles.pickerRowMeta}>
                        {t.blocks.reduce((s, b) => s + b.items.length, 0)} exercises
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.blockSummary}>
                {template.blocks
                  .filter((block) => block.items.length > 0)
                  .map((block, idx, arr) => (
                    <SummaryRow
                      key={block.id}
                      color={getBlockDisplayColor(block)}
                      label={getBlockDisplayLabel(block)}
                      value={
                        block.type === 'emom'
                          ? `${block.items.length} exercises · ${block.emomMinutes} min`
                          : block.type === 'juarez'
                            ? `${block.items.length} ex · ${block.juarezStartingReps ?? 10} rounds${block.juarezSuperset ? ' superset' : ''}`
                            : `${block.items.length} exercise${block.items.length !== 1 ? 's' : ''}`
                      }
                      isLast={idx === arr.length - 1}
                    />
                  ))}
              </View>
            </>
          )}
        </ScrollView>
        <View style={styles.idleBottomActions}>
          {alarmCountdownSecs !== null ? (
            /* ── Countdown active ── */
            <View style={styles.alarmCountdown}>
              <View style={styles.alarmCountdownHeader}>
                <Ionicons name="alarm-outline" size={20} color={colors.warning} />
                <Text style={styles.alarmCountdownTime}>
                  {alarmCountdownSecs > 0 ? formatCountdown(alarmCountdownSecs) : 'Alarm!'}
                </Text>
                {alarmCountdownPaused && (
                  <View style={styles.alarmPausedBadge}>
                    <Text style={styles.alarmPausedText}>Paused</Text>
                  </View>
                )}
              </View>
              <View style={styles.alarmCountdownControls}>
                {alarmCountdownSecs > 0 && (
                  alarmCountdownPaused ? (
                    <TouchableOpacity style={styles.alarmCtrlBtn} onPress={handleResumeAlarm} activeOpacity={0.7}>
                      <Ionicons name="play" size={16} color={colors.accent} />
                      <Text style={[styles.alarmCtrlText, { color: colors.accent }]}>Resume</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.alarmCtrlBtn} onPress={handlePauseAlarm} activeOpacity={0.7}>
                      <Ionicons name="pause" size={16} color={colors.textSecondary} />
                      <Text style={styles.alarmCtrlText}>Pause</Text>
                    </TouchableOpacity>
                  )
                )}
                <TouchableOpacity style={styles.alarmCtrlBtn} onPress={handleStopAlarm} activeOpacity={0.7}>
                  <Ionicons name="close-circle-outline" size={16} color={colors.warning} />
                  <Text style={[styles.alarmCtrlText, { color: colors.warning }]}>Cancel alarm</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          {template && (
            <View style={styles.startRow}>
              <TouchableOpacity
                style={[styles.startBtn, template.alarmMinutes ? styles.startBtnCompact : null]}
                onPress={() => handleStart()}
                activeOpacity={0.8}
              >
                <Ionicons name="play" size={22} color="#fff" />
                <Text style={styles.startBtnText}>Start Workout</Text>
              </TouchableOpacity>
              {template.alarmMinutes && alarmCountdownSecs === null && (
                <TouchableOpacity style={styles.alarmFab} onPress={handleStartAlarm} activeOpacity={0.8}>
                  <Ionicons name="alarm-outline" size={28} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </SafeAreaView>

      {/* ── Quick-timer config modal (countup / juarez / emom / pr) ── */}
      <QuickTimerConfigModal
        kind={configKind ?? 'countup'}
        visible={configKind !== null}
        onCancel={() => setConfigKind(null)}
        onStart={(cfg) => {
          setConfigKind(null);
          startAdhoc(buildFromConfig(cfg, colors.accent));
        }}
      />
    </>
  );
  }

  if (phase === 'done' || phase === 'stopped') {
    const isStopped = phase === 'stopped';
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.completionContent} keyboardShouldPersistTaps="handled">
            <View style={[styles.completionIcon, { backgroundColor: isStopped ? colors.warningDim : colors.successDim }]}>
              <Ionicons name={isStopped ? 'stop-circle-outline' : 'checkmark'} size={52}
                color={isStopped ? colors.warning : colors.success} />
            </View>
            <Text style={styles.completionTitle}>{isStopped ? 'Workout Stopped' : 'Workout Complete!'}</Text>
            {startedAt && workoutEndedAt && (
              <Text style={styles.completionDuration}>
                {formatDuration(Math.floor((workoutEndedAt.getTime() - startedAt.getTime()) / 1000))}
              </Text>
            )}
            <View style={styles.noteSection}>
              <Text style={styles.noteLabel}>NOTES (OPTIONAL)</Text>
              <TextInput style={styles.noteInput} value={note} onChangeText={setNote}
                placeholder="How did it go?" placeholderTextColor={colors.textTertiary}
                multiline numberOfLines={3} />
            </View>

              {/* Review / edit exercises before saving */}
            <View style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>REVIEW EXERCISES</Text>
              {template!.blocks.map((block) => {
                const bColor = getBlockDisplayColor(block);
                const bLabel = getBlockDisplayLabel(block).toUpperCase();
                if (block.items.length === 0) return null;
                return (
                  <View key={block.id} style={styles.reviewBlock}>
                    <Text style={[styles.reviewBlockLabel, { color: bColor }]}>{bLabel}</Text>
                    {block.type === 'emom' ? (
                      Array.from({ length: block.emomMinutes ?? 0 }, (_, step) => {
                        const item = block.items[step % block.items.length];
                        const rowKey = `${block.id}-emom-${step}`;
                        const repsKey = `${block.id}-${step}`;
                        const emomCompleted = emomCompletedByBlock[block.id] ?? 0;
                        const emomSkipped = emomSkippedByBlock[block.id] ?? [];
                        const notReached = isStopped && step >= emomCompleted && !emomSkipped.includes(step);
                        return (
                          <CompletionExerciseRow
                            key={rowKey} rowKey={rowKey} repsKey={repsKey} item={item}
                            label={`min ${step + 1}`}
                            isSkipped={emomSkipped.includes(step)}
                            isNotReached={notReached}
                            actualReps={actualReps} actualWeights={actualWeights} actualDurations={actualDurations}
                            expandedKey={reviewExpandedKey}
                            onToggle={() => setReviewExpandedKey(reviewExpandedKey === rowKey ? null : rowKey)}
                            onChangeReps={(k, v) => setActualReps((prev) => ({ ...prev, [k]: v }))}
                            onChangeWeight={(k, v) => setActualWeights((prev) => ({ ...prev, [k]: v }))}
                            onChangeDuration={(k, v) => setActualDurations((prev) => ({ ...prev, [k]: v }))}
                            onUnskip={() => {
                              setEmomSkippedByBlock((prev) => ({ ...prev, [block.id]: (prev[block.id] ?? []).filter((s) => s !== step) }));
                              setEmomCompletedByBlock((prev) => ({ ...prev, [block.id]: Math.max(prev[block.id] ?? 0, step + 1) }));
                            }}
                            onMarkSkipped={() => {
                              setEmomSkippedByBlock((prev) => ({ ...prev, [block.id]: [...(prev[block.id] ?? []), step] }));
                              setEmomCompletedByBlock((prev) => ({ ...prev, [block.id]: Math.max(0, (prev[block.id] ?? 0) - 1) }));
                            }}
                            color={bColor}
                          />
                        );
                      })
                    ) : block.type === 'juarez' ? (
                      Array.from({ length: juarezStepCount(block) }, (_, step) => {
                        const { itemIdx, reps, round } = juarezStepInfo(step, block);
                        const item = block.items[itemIdx];
                        if (!item) return null;
                        const rowKey = `${block.id}-juarez-${step}`;
                        const repsKey = `${block.id}-${step}`;
                        const completed = completedByBlock[block.id] ?? [];
                        const skipped = skippedByBlock[block.id] ?? [];
                        const notReached = isStopped && !completed.includes(step) && !skipped.includes(step);
                        // Override reps with the computed Juarez value for display.
                        const displayItem = { ...item, reps };
                        return (
                          <CompletionExerciseRow
                            key={rowKey} rowKey={rowKey} repsKey={repsKey} item={displayItem}
                            label={`round ${round + 1}`}
                            isSkipped={skipped.includes(step)}
                            isNotReached={notReached}
                            actualReps={actualReps} actualWeights={actualWeights} actualDurations={actualDurations}
                            expandedKey={reviewExpandedKey}
                            onToggle={() => setReviewExpandedKey(reviewExpandedKey === rowKey ? null : rowKey)}
                            onChangeReps={(k, v) => setActualReps((prev) => ({ ...prev, [k]: v }))}
                            onChangeWeight={(k, v) => setActualWeights((prev) => ({ ...prev, [k]: v }))}
                            onChangeDuration={(k, v) => setActualDurations((prev) => ({ ...prev, [k]: v }))}
                            onUnskip={() => setSkippedByBlock((prev) => ({ ...prev, [block.id]: (prev[block.id] ?? []).filter((i) => i !== step) }))}
                            onMarkSkipped={() => setSkippedByBlock((prev) => ({ ...prev, [block.id]: [...(prev[block.id] ?? []), step] }))}
                            color={bColor}
                          />
                        );
                      })
                    ) : (
                      block.items.map((item, idx) => {
                        const key = `${block.id}-${idx}`;
                        const completed = completedByBlock[block.id] ?? [];
                        const skipped = skippedByBlock[block.id] ?? [];
                        const notReached = isStopped && !completed.includes(idx) && !skipped.includes(idx);
                        return (
                          <CompletionExerciseRow
                            key={key} rowKey={key} repsKey={key} item={item}
                            isSkipped={skipped.includes(idx)}
                            isNotReached={notReached}
                            actualReps={actualReps} actualWeights={actualWeights} actualDurations={actualDurations}
                            expandedKey={reviewExpandedKey}
                            onToggle={() => setReviewExpandedKey(reviewExpandedKey === key ? null : key)}
                            onChangeReps={(k, v) => setActualReps((prev) => ({ ...prev, [k]: v }))}
                            onChangeWeight={(k, v) => setActualWeights((prev) => ({ ...prev, [k]: v }))}
                            onChangeDuration={(k, v) => setActualDurations((prev) => ({ ...prev, [k]: v }))}
                            onUnskip={() => setSkippedByBlock((prev) => ({ ...prev, [block.id]: (prev[block.id] ?? []).filter((i) => i !== idx) }))}
                            onMarkSkipped={() => setSkippedByBlock((prev) => ({ ...prev, [block.id]: [...(prev[block.id] ?? []), idx] }))}
                            color={bColor}
                          />
                        );
                      })
                    )}
                  </View>
                );
              })}
            </View>
            {saveError && !hasSaved && (
              <View style={[styles.saveErrorBanner, { backgroundColor: colors.dangerDim }]}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={[styles.saveErrorText, { color: colors.danger }]}>{saveError}</Text>
              </View>
            )}
            {hasSaved ? (
              <View style={[styles.saveBtn, { backgroundColor: colors.success }]}>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Saved to History</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.saveBtn, savingRef.current && { opacity: 0.6 }]}
                onPress={confirmLog}
                activeOpacity={0.8}
                disabled={savingRef.current}
              >
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Save to History</Text>
              </TouchableOpacity>
            )}
            {hasSaved && (
              <TouchableOpacity
                style={styles.resumeBtn}
                onPress={() => {
                  // Reset to the template-select screen so the user can start
                  // fresh or pick another workout.
                  savingRef.current = false;
                  setHasSaved(false);
                  setAdhocTemplate(null);
                  setSelectedTemplateId(null);
                  setStartedAt(null);
                  setPhase('idle');
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done-outline" size={18} color={colors.accent} />
                <Text style={styles.resumeBtnText}>Done</Text>
              </TouchableOpacity>
            )}
            {isStopped && !hasSaved && (
              <TouchableOpacity style={styles.resumeBtn} onPress={handleResume} activeOpacity={0.8}>
                <Ionicons name="play-outline" size={18} color={colors.accent} />
                <Text style={styles.resumeBtnText}>Resume Workout</Text>
              </TouchableOpacity>
            )}
            {!hasSaved && (
              <TouchableOpacity style={styles.discardBtn} onPress={handleDiscard} activeOpacity={0.7}>
                <Text style={styles.discardBtnText}>Discard</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Active execution ────────────────────────────────────────────────────────
  const color = currentBlock ? getBlockDisplayColor(currentBlock) : colors.textPrimary;
  const dim = currentBlock ? (currentBlock.customColor ? `${currentBlock.customColor}25` : blockDim(currentBlock.type)) : 'transparent';
  const label = currentBlock ? getBlockDisplayLabel(currentBlock).toUpperCase() : '';
  const isRestPhase = phase === 'rest';
  // `exerciseTimerActive` (not seconds>0) is the signal a timer is running,
  // because a count-up timer legitimately reads 0 at the start.
  const isDurationExercise = exerciseTimerActive;
  // For count-up timers the Done button is the Stop action, so it must stay
  // visible even while the timer is running (unlike countdown, which hides it).
  const currentExType = currentItem ? getExecutionType(currentItem) : 'reps';
  const isCountupExercise = isDurationExercise && currentExType === 'countup';

  const nextUpText = (() => {
    if (!template || !currentBlock) return '';
    if (phase === 'emom') {
      const nextStep = emomStep + 1;
      if (nextStep >= (currentBlock.emomMinutes ?? 0)) {
          const nextBlock = template.blocks[blockIdx + 1];
          return nextBlock ? getBlockDisplayLabel(nextBlock) : 'Done';
        }
      const nextItem = currentBlock.items[nextStep % currentBlock.items.length];
      return nextItem?.exerciseName ?? '';
    }
    if (phase === 'rest' && restTypeRef.current === 'sets') {
      const item = currentBlock.items[manualIdx];
      const totalSets = item?.sets ?? 1;
      return `Set ${manualSetIdx + 2}/${totalSets} – ${item?.exerciseName ?? ''}`;
    }
    // Juarez Valley: "next up" is the next performance (the other exercise in
    // a superset, or the next rung for single), or the next block when done.
    if (currentBlock.type === 'juarez') {
      const totalRounds = juarezStepCount(currentBlock);
      if (manualIdx + 1 < totalRounds) {
        const { itemIdx, reps } = juarezStepInfo(manualIdx + 1, currentBlock);
        const nextItem = currentBlock.items[itemIdx];
        return nextItem ? `Round ${manualIdx + 2} – ${nextItem.exerciseName} (${reps})` : `Round ${manualIdx + 2}`;
      }
      const nextBlock = template.blocks[blockIdx + 1];
      return nextBlock ? getBlockDisplayLabel(nextBlock) : 'Done';
    }
    const nextItem = currentBlock.items[manualIdx + 1];
    if (nextItem) return nextItem.exerciseName;
    const nextBlock = template.blocks[blockIdx + 1];
    return nextBlock ? getBlockDisplayLabel(nextBlock) : 'Done';
  })();

  const doneBtnLabel = (() => {
    if (currentBlock?.type === 'juarez') {
      const totalRounds = juarezStepCount(currentBlock);
      const isLast = manualIdx >= totalRounds - 1;
      return isLast ? 'Finish Round' : 'Round Done';
    }
    const item = currentBlock?.items[manualIdx];
    if (item && getExecutionType(item) === 'countup') return 'Stop & Record';
    const totalSets = item?.sets ?? 1;
    return totalSets > 1 ? `Set ${manualSetIdx + 1}/${totalSets} Done` : 'Exercise Done';
  })();

  // Actual reps key for current exercise
  const repsKey = phase === 'emom'
    ? `${currentBlock?.id ?? 'e'}-${emomStep}`
    : `${currentBlock?.id ?? 'x'}-${manualIdx}`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeepAwakeActive />
      <ExerciseDetailModal
        exercise={exercises.find((e) => e.name.toLowerCase() === (detailExerciseName ?? '').toLowerCase()) ?? null}
        onClose={closeDetail}
      />
      {/* Phase badge */}
      <View style={styles.phaseBadgeRow}>
        <View style={[styles.phaseBadge, { backgroundColor: dim }]}>
          <Text style={[styles.phaseBadgeText, { color }]}>{label}</Text>
        </View>
        <Text style={styles.progressText}>{progressText}</Text>
      </View>
      {/* Alarm indicator */}
      {alarmNotifId && (
        <View style={styles.alarmActiveRow}>
          <Ionicons name="alarm-outline" size={13} color={colors.warning} />
          <Text style={styles.alarmActiveText}>
            {alarmCountdownSecs != null && alarmCountdownSecs > 0
              ? `Alarm in ${formatCountdown(alarmCountdownSecs)}`
              : `Alarm in ${template?.alarmMinutes} min`}
          </Text>
          <TouchableOpacity
            style={styles.alarmCancelBtn}
            onPress={handleStopAlarm}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.alarmCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.mainContentScroll}
        contentContainerStyle={styles.mainContent}
        scrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {isRestPhase ? (
          <View style={styles.restView}>
            <Text style={styles.restLabel}>REST</Text>
            <TouchableOpacity onPress={handleTogglePause} activeOpacity={0.8}
              style={[styles.timerRing, { borderColor: `${color}44` }]}>
              {isPaused
                ? <Ionicons name="pause" size={72} color={color} />
                : <><Text style={[styles.timerBig, { color }]}>{restSeconds}</Text>
                    <Text style={styles.timerSub}>seconds</Text></>
              }
            </TouchableOpacity>
            <Text style={styles.nextUpLabel}>
              Next up: <Text style={{ color: colors.textPrimary }}>{nextUpText}</Text>
            </Text>
            <TouchableOpacity style={styles.skipRestBtn} onPress={handleSkipRest}>
              <Text style={styles.skipRestText}>Skip Rest</Text>
            </TouchableOpacity>
          </View>

        ) : phase === 'emom' ? (
          <View style={styles.emomView}>
            <TouchableOpacity onPress={handleTogglePause} activeOpacity={0.8}
              style={[styles.timerRing, { borderColor: `${color}44` }]}>
              {isPaused
                ? <Ionicons name="pause" size={72} color={color} />
                : <><Text style={[styles.timerBig, { color }]}>{emomSeconds}</Text>
                    <Text style={styles.timerSub}>seconds</Text></>
              }
            </TouchableOpacity>
            <View style={styles.emomProgressBar}>
              <View style={[styles.emomProgressFill, { width: `${emomProgress * 100}%`, backgroundColor: color }]} />
            </View>
            {currentItem && (
              <View style={styles.exerciseCard}>
                <TouchableOpacity onPress={() => openDetail(currentItem.exerciseName)} activeOpacity={0.7}>
                  <Text style={styles.exerciseName}>{currentItem.exerciseName}</Text>
                </TouchableOpacity>
                <View style={styles.exerciseMeta}>
                  <MetaPill
                    value={`${currentItem.reps}${currentItem.repMode !== 'bilateral' ? ' x 2' : ''}`}
                    label="REPS"
                    color={color}
                    onPress={() => setEditingField(editingField === 'reps' ? null : 'reps')}
                    active={editingField === 'reps'}
                  />
                  {currentItem.weight > 0 && (
                    <MetaPill
                      value={`${actualWeights[repsKey] ?? currentItem.weight}kg`}
                      label="WEIGHT"
                      color={color}
                      onPress={() => setEditingField(editingField === 'weight' ? null : 'weight')}
                      active={editingField === 'weight'}
                    />
                  )}
                  <MetaPill value={currentItem.repMode === 'unilateral-fr' ? 'F + R' : currentItem.repMode !== 'bilateral' ? 'L + R' : 'Both'} label="SIDE" color={color} />
                </View>
                {editingField === 'reps' && (
                  <ActualRepsInputs
                    item={currentItem}
                    repsKey={repsKey}
                    actualReps={actualReps}
                    onChangeReps={(key, val) => setActualReps((prev) => ({ ...prev, [key]: val }))}
                    color={color}
                  />
                )}
                {editingField === 'weight' && (
                  <WeightInput
                    item={currentItem}
                    repsKey={repsKey}
                    actualWeights={actualWeights}
                    onChangeWeight={(key, val) => setActualWeights((prev) => ({ ...prev, [key]: val }))}
                    color={color}
                  />
                )}
              </View>
            )}
            {nextUpText !== '' && (
              <Text style={styles.nextUpLabel}>
                Next up: <Text style={{ color: colors.textPrimary }}>{nextUpText}</Text>
              </Text>
            )}
          </View>

        ) : (
          // Starter / finisher / juarez manual
          <View style={styles.manualView}>
            {currentItem && (
              <>
                <TouchableOpacity onPress={() => openDetail(currentItem.exerciseName)} activeOpacity={0.7}>
                  <Text style={styles.exerciseName}>{currentItem.exerciseName}</Text>
                </TouchableOpacity>

                {/* Duration exercise: show timer ring (countdown or count-up) */}
                {isDurationExercise && (
                  <TouchableOpacity onPress={handleTogglePause} activeOpacity={0.8}
                    style={[styles.timerRing, { borderColor: `${color}44` }]}>
                    {isPaused
                      ? <Ionicons name="pause" size={72} color={color} />
                      : <><Text style={[styles.timerBig, { color }]}>{exerciseTimerSeconds}</Text>
                          <Text style={styles.timerSub}>{isCountupExercise ? 'seconds elapsed' : 'seconds'}</Text></>
                    }
                  </TouchableOpacity>
                )}

                <View style={styles.exerciseMeta}>
                  {(() => {
                    const t = getExecutionType(currentItem);
                    if (t === 'countup') {
                      // Value is driven by the running timer; show it live, or the
                      // recorded value once stopped. Neutral "elapsed" wording —
                      // a count-up timer fits any timed work, not just max holds.
                      const live = isDurationExercise ? `${exerciseTimerSeconds}s` : `${actualDurations[repsKey] ?? 0}s`;
                      return <MetaPill value={live} label="ELAPSED" color={color} />;
                    }
                    if (t === 'countdown') {
                      return <MetaPill value={`${currentItem.durationSeconds}s`} label="DURATION" color={color} />;
                    }
                    return (
                      <MetaPill
                        value={`${currentItem.reps}${currentItem.repMode !== 'bilateral' ? ' x 2' : ''}`}
                        label="REPS"
                        color={color}
                        onPress={() => setEditingField(editingField === 'reps' ? null : 'reps')}
                        active={editingField === 'reps'}
                      />
                    );
                  })()}
                  {currentItem.weight > 0 && (
                    <MetaPill
                      value={`${actualWeights[repsKey] ?? currentItem.weight}kg`}
                      label="WEIGHT"
                      color={color}
                      onPress={() => setEditingField(editingField === 'weight' ? null : 'weight')}
                      active={editingField === 'weight'}
                    />
                  )}
                  <MetaPill value={currentItem.repMode === 'unilateral-fr' ? 'F + R' : currentItem.repMode !== 'bilateral' ? 'L + R' : 'Both'} label="SIDE" color={color} />
                </View>
                {currentItem.restTime > 0 && (
                  <Text style={styles.restHint}>{currentItem.restTime}s rest follows</Text>
                )}

                {editingField === 'reps' && getExecutionType(currentItem) === 'reps' && (
                  <ActualRepsInputs
                    item={currentItem}
                    repsKey={repsKey}
                    actualReps={actualReps}
                    onChangeReps={(key, val) => setActualReps((prev) => ({ ...prev, [key]: val }))}
                    color={color}
                  />
                )}
                {editingField === 'weight' && (
                  <WeightInput
                    item={currentItem}
                    repsKey={repsKey}
                    actualWeights={actualWeights}
                    onChangeWeight={(key, val) => setActualWeights((prev) => ({ ...prev, [key]: val }))}
                    color={color}
                  />
                )}
              </>
            )}
            {nextUpText !== '' && (
              <Text style={styles.nextUpLabel}>
                Next up: <Text style={{ color: colors.textPrimary }}>{nextUpText}</Text>
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom actions */}
      <View style={styles.bottomActions}>
        {/* Done button: hidden during rest, EMOM, or while a countdown timer runs.
            For a count-up timer it stays visible as the Stop & Record action. */}
        {!isRestPhase && phase !== 'emom' && (!isDurationExercise || isCountupExercise) && (
          <TouchableOpacity style={[styles.doneBtn, { backgroundColor: color }]}
            onPress={isCountupExercise ? handleStopTimer : handleManualDone} activeOpacity={0.8}>
            <Ionicons name="checkmark" size={22} color="#fff" />
            <Text style={styles.doneBtnText}>{doneBtnLabel}</Text>
          </TouchableOpacity>
        )}

        {/* Previous + Skip row */}
        {!isRestPhase && (
          <View style={styles.prevSkipRow}>
            <TouchableOpacity
              style={[styles.prevSkipBtn, (phase === 'emom' ? (emomStep === 0 && blockIdx === 0) : (manualIdx === 0 && blockIdx === 0)) && styles.prevSkipBtnDisabled]}
              onPress={phase === 'emom' ? handlePreviousEmomStep : handlePreviousExercise}
              disabled={phase === 'emom' ? (emomStep === 0 && blockIdx === 0) : (manualIdx === 0 && blockIdx === 0)}
              activeOpacity={0.7}>
              <Ionicons name="play-skip-back-outline" size={15} color={colors.textTertiary} />
              <Text style={styles.prevSkipBtnText}>Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.prevSkipBtn}
              onPress={phase === 'emom' ? handleSkipEmomStep : handleSkipExercise}
              activeOpacity={0.7}>
              <Ionicons name="play-skip-forward-outline" size={15} color={colors.textTertiary} />
              <Text style={styles.prevSkipBtnText}>Skip</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
          <Ionicons name="stop-outline" size={16} color={colors.danger} />
          <Text style={styles.stopBtnText}>Stop</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// Keeps screen awake while mounted — rendered only during active execution
function KeepAwakeActive() {
  useKeepAwake();
  return null;
}

function ActualRepsInputs({
  item,
  repsKey,
  actualReps,
  onChangeReps,
  color,
}: {
  item: WorkoutItem;
  repsKey: string;
  actualReps: Record<string, number>;
  onChangeReps: (key: string, value: number) => void;
  color: string;
}) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const parse = (v: string, fallback: number) => {
    const n = parseInt(v, 10);
    return !isNaN(n) && n >= 0 ? n : fallback;
  };

  if (item.repMode !== 'bilateral') {
    const sideLabels: [string, string] = item.repMode === 'unilateral-fr' ? ['F', 'R'] : ['L', 'R'];
    return (
      <View style={styles.actualRepsRow}>
        <Text style={styles.actualRepsLabel}>ACTUAL REPS</Text>
        <View style={styles.actualRepsUnilateral}>
          <View style={styles.actualRepsSide}>
            <Text style={styles.actualRepsSideLabel}>{sideLabels[0]}</Text>
            <NumericInput
              style={[styles.actualRepsInput, { borderColor: color }]}
              value={actualReps[`${repsKey}-L`] ?? item.reps}
              onCommit={(n) => onChangeReps(`${repsKey}-L`, n)}
              selectTextOnFocus
            />
          </View>
          <View style={styles.actualRepsSide}>
            <Text style={styles.actualRepsSideLabel}>{sideLabels[1]}</Text>
            <NumericInput
              style={[styles.actualRepsInput, { borderColor: color }]}
              value={actualReps[`${repsKey}-R`] ?? item.reps}
              onCommit={(n) => onChangeReps(`${repsKey}-R`, n)}
              selectTextOnFocus
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.actualRepsRow}>
      <Text style={styles.actualRepsLabel}>ACTUAL REPS</Text>
      <NumericInput
        style={[styles.actualRepsInput, { borderColor: color }]}
        value={actualReps[repsKey] ?? item.reps}
        onCommit={(n) => onChangeReps(repsKey, n)}
        selectTextOnFocus
      />
    </View>
  );
}

function WeightInput({
  item,
  repsKey,
  actualWeights,
  onChangeWeight,
  color,
}: {
  item: WorkoutItem;
  repsKey: string;
  actualWeights: Record<string, number>;
  onChangeWeight: (key: string, value: number) => void;
  color: string;
}) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  return (
    <View style={styles.actualRepsRow}>
      <Text style={styles.actualRepsLabel}>ACTUAL WEIGHT (kg)</Text>
      <NumericInput
        style={[styles.actualRepsInput, { borderColor: color }]}
        value={actualWeights[repsKey] ?? item.weight}
        onCommit={(n) => onChangeWeight(repsKey, n)}
        isFloat
        selectTextOnFocus
      />
    </View>
  );
}

function DurationInput({
  item,
  repsKey,
  actualDurations,
  onChangeDuration,
  color,
}: {
  item: WorkoutItem;
  repsKey: string;
  actualDurations: Record<string, number>;
  onChangeDuration: (key: string, value: number) => void;
  color: string;
}) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  return (
    <View style={styles.actualRepsRow}>
      <Text style={styles.actualRepsLabel}>ACTUAL DURATION (s)</Text>
      <NumericInput
        style={[styles.actualRepsInput, { borderColor: color }]}
        value={actualDurations[repsKey] ?? item.durationSeconds ?? 0}
        onCommit={(n) => onChangeDuration(repsKey, n)}
        min={0}
        selectTextOnFocus
      />
    </View>
  );
}

function CompletionExerciseRow({
  rowKey,
  repsKey,
  item,
  label,
  isSkipped,
  isNotReached,
  actualReps,
  actualWeights,
  actualDurations,
  expandedKey,
  onToggle,
  onChangeReps,
  onChangeWeight,
  onChangeDuration,
  onUnskip,
  onMarkSkipped,
  color,
}: {
  rowKey: string;
  repsKey: string;
  item: WorkoutItem;
  label?: string;
  isSkipped: boolean;
  isNotReached?: boolean;
  actualReps: Record<string, number>;
  actualWeights: Record<string, number>;
  actualDurations: Record<string, number>;
  expandedKey: string | null;
  onToggle: () => void;
  onChangeReps: (key: string, value: number) => void;
  onChangeWeight: (key: string, value: number) => void;
  onChangeDuration: (key: string, value: number) => void;
  onUnskip?: () => void;
  onMarkSkipped?: () => void;
  color: string;
}) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const isOpen = expandedKey === rowKey;
  const exType = getExecutionType(item);
  const isDuration = exType !== 'reps';

  // Not-reached: show as non-interactive incomplete row (like history log)
  if (isNotReached) {
    return (
      <View style={[styles.reviewRow, styles.reviewRowNotReached]}>
        <Ionicons name="ellipse-outline" size={14} color={colors.textTertiary} />
        <Text style={[styles.reviewRowName, { color: colors.textTertiary }]} numberOfLines={1}>
          {label ? `${label} · ${item.exerciseName}` : item.exerciseName}
        </Text>
      </View>
    );
  }

  const displayReps = isDuration
    ? `${actualDurations[repsKey] ?? item.durationSeconds ?? 0}s`
    : item.repMode !== 'bilateral'
      ? `${actualReps[`${repsKey}-L`] ?? item.reps}${item.repMode === 'unilateral-fr' ? 'F' : 'L'} / ${actualReps[`${repsKey}-R`] ?? item.reps}R`
      : `${actualReps[repsKey] ?? item.reps} reps`;
  const actualWeight = actualWeights[repsKey] ?? item.weight;
  const displayWeight = actualWeight > 0 ? `${actualWeight}kg` : '';

  return (
    <View>
      <TouchableOpacity
        style={[styles.reviewRow, isSkipped && styles.reviewRowSkipped]}
        onPress={onToggle}
        activeOpacity={0.7}>
        {isSkipped && <Ionicons name="play-skip-forward-outline" size={14} color={colors.textTertiary} />}
        <Text style={[styles.reviewRowName, isSkipped && { color: colors.textTertiary }]} numberOfLines={1}>
          {label ? `${label} · ${item.exerciseName}` : item.exerciseName}
        </Text>
        <View style={styles.reviewRowRight}>
          {isSkipped
            ? <Text style={styles.reviewRowSkippedText}>skipped</Text>
            : <>
                <Text style={[styles.reviewRowDetail, { color }]}>{displayReps}</Text>
                {displayWeight ? <Text style={styles.reviewRowWeight}>{displayWeight}</Text> : null}
              </>
          }
          <Ionicons name={isOpen ? 'chevron-up' : 'pencil-outline'} size={13} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>
      {isOpen && (
        <View style={styles.reviewEditSection}>
          {isSkipped && onUnskip && (
            <TouchableOpacity style={styles.unskipBtn} onPress={onUnskip} activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={14} color={colors.accent} />
              <Text style={styles.unskipBtnText}>Mark as done</Text>
            </TouchableOpacity>
          )}
          {!isSkipped && onMarkSkipped && (
            <TouchableOpacity style={styles.markSkippedBtn} onPress={onMarkSkipped} activeOpacity={0.7}>
              <Ionicons name="play-skip-forward-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.markSkippedBtnText}>Mark as skipped</Text>
            </TouchableOpacity>
          )}
          {isDuration ? (
            <DurationInput
              item={item} repsKey={repsKey} actualDurations={actualDurations}
              onChangeDuration={onChangeDuration} color={color}
            />
          ) : (
            <ActualRepsInputs
              item={item} repsKey={repsKey} actualReps={actualReps}
              onChangeReps={onChangeReps} color={color}
            />
          )}
          {item.weight > 0 && (
            <WeightInput
              item={item} repsKey={repsKey} actualWeights={actualWeights}
              onChangeWeight={onChangeWeight} color={color}
            />
          )}
        </View>
      )}
    </View>
  );
}

function SummaryRow({ color, label, value, isLast }: { color: string; label: string; value: string; isLast?: boolean }) {
  const { colors } = useSettings();
  const summaryStyles = makeSummaryStyles(colors);
  return (
    <View style={[summaryStyles.row, isLast && summaryStyles.rowLast]}>
      <View style={[summaryStyles.dot, { backgroundColor: color }]} />
      <Text style={summaryStyles.label}>{label}</Text>
      <Text style={summaryStyles.value}>{value}</Text>
    </View>
  );
}
function makeSummaryStyles(c: typeof Colors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border },
    rowLast: { borderBottomWidth: 0 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    label: { ...Typography.body, color: c.textSecondary, width: 80 },
    value: { ...Typography.bodyBold, color: c.textPrimary, flex: 1 },
  });
}

function MetaPill({
  value,
  label,
  color,
  onPress,
  active,
}: {
  value: string;
  label: string;
  color: string;
  onPress?: () => void;
  active?: boolean;
}) {
  const bg = active ? `${color}35` : `${color}18`;
  const { colors } = useSettings();
  const metaStyles = makeMetaStyles(colors);
  if (onPress) {
    return (
      <TouchableOpacity
        style={[metaStyles.pill, { backgroundColor: bg }]}
        onPress={onPress}
        activeOpacity={0.6}>
        <Text style={[metaStyles.value, { color }]}>{value}</Text>
        <Text style={metaStyles.label}>{label}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={[metaStyles.pill, { backgroundColor: bg }]}>
      <Text style={[metaStyles.value, { color }]}>{value}</Text>
      <Text style={metaStyles.label}>{label}</Text>
    </View>
  );
}
function makeMetaStyles(c: typeof Colors) {
  return StyleSheet.create({
    pill: { alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md, minWidth: 72 },
    value: { ...Typography.h3 },
    label: { ...Typography.tiny, color: c.textTertiary, marginTop: 2 },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  flex: { flex: 1 },

  emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyTitle: { ...Typography.h2, color: c.textSecondary, textAlign: 'center' },
  emptySubtitle: { ...Typography.body, color: c.textTertiary, textAlign: 'center', lineHeight: 22 },

  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
  },
  title: { ...Typography.h1, color: c.textPrimary },
  idleScrollContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.lg, gap: Spacing.lg, flexGrow: 1 },
  idleBottomActions: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.sm },
  alarmActiveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  alarmActiveText: { ...Typography.caption, color: c.warning, flex: 1 },
  alarmCancelBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  alarmCancelText: { ...Typography.captionBold, color: c.textTertiary },
  idleWorkoutName: { ...Typography.h1, color: c.textPrimary, textAlign: 'center' },
  pickerSection: {
    width: '100%',
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  pickerSectionLabel: { ...Typography.captionBold, color: c.textTertiary, marginBottom: Spacing.xs },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  pickerRowSelected: { backgroundColor: c.accentDim ?? 'rgba(99,102,241,0.1)' },
  pickerRowText: { ...Typography.body, color: c.textPrimary, flex: 1 },
  pickerRowMeta: { ...Typography.caption, color: c.textTertiary },
  blockSummary: { backgroundColor: c.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: c.border, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md },
  startBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: c.accent, borderRadius: Radius.full, paddingVertical: 18, shadowColor: c.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10 },
  startBtnText: { ...Typography.h3, color: '#fff' },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  startBtnCompact: { flex: 1 },
  // Quick-timer (ad-hoc) buttons row — a wrapping 2×2 grid of rounded buttons
  // (Count-up / Juarez / EMOM / PR) above the workout picker. Each button is
  // 48% wide with space-between so two per row line up without overflow.
  quickTimersRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.sm, width: '100%' },
  quickTimerBtn: { width: '48%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.xl, borderWidth: 1.5, paddingVertical: 14 },
  quickTimerBtnText: { ...Typography.captionBold },
  alarmFab: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.warning, alignItems: 'center', justifyContent: 'center', shadowColor: c.warning, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 10 },
  alarmCountdown: { backgroundColor: c.warningDim, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm },
  alarmCountdownHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  alarmCountdownTime: { ...Typography.h2, color: c.warning },
  alarmPausedBadge: { backgroundColor: c.surface, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  alarmPausedText: { ...Typography.captionBold, color: c.textTertiary },
  alarmCountdownControls: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.lg },
  alarmCtrlBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  alarmCtrlText: { ...Typography.captionBold, color: c.textSecondary },

  completionContent: { padding: Spacing.lg, paddingTop: Spacing.xl, alignItems: 'center', gap: Spacing.lg, flexGrow: 1, justifyContent: 'center' },
  completionIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  completionTitle: { ...Typography.h1, color: c.textPrimary },
  completionDuration: { ...Typography.h2, color: c.textSecondary },
  noteSection: { width: '100%', gap: Spacing.sm },
  noteLabel: { ...Typography.tiny, color: c.textTertiary, letterSpacing: 1.5 },
  noteInput: { backgroundColor: c.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: c.border, padding: Spacing.md, ...Typography.body, color: c.textPrimary, minHeight: 80, textAlignVertical: 'top' },
  saveBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: c.accent, borderRadius: Radius.full, paddingVertical: 18, shadowColor: c.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  saveBtnText: { ...Typography.bodyBold, color: '#fff' },
  saveErrorBanner: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  saveErrorText: { ...Typography.caption, flexShrink: 1 },
  resumeBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderRadius: Radius.full, paddingVertical: 16, borderWidth: 1.5, borderColor: c.accent },
  resumeBtnText: { ...Typography.bodyBold, color: c.accent },
  discardBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
  discardBtnText: { ...Typography.body, color: c.textTertiary },

  phaseBadgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  phaseBadge: { borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  phaseBadgeText: { ...Typography.tiny, fontWeight: '700', letterSpacing: 1.5 },
  progressText: { ...Typography.captionBold, color: c.textTertiary },

  mainContentScroll: { flex: 1 },
  mainContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },

  emomView: { alignItems: 'center', gap: Spacing.lg },
  timerRing: { width: 180, height: 180, borderRadius: 90, borderWidth: 4, alignItems: 'center', justifyContent: 'center', gap: 4 },
  timerBig: { ...Typography.hero, lineHeight: 64 },
  timerSub: { ...Typography.caption, color: c.textTertiary },
  emomProgressBar: { width: '100%', height: 4, backgroundColor: c.border, borderRadius: 2, overflow: 'hidden' },
  emomProgressFill: { height: 4, borderRadius: 2 },
  exerciseCard: { width: '100%', backgroundColor: c.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: c.border, padding: Spacing.md, gap: Spacing.md, alignItems: 'center' },
  exerciseName: { ...Typography.h2, color: c.textPrimary, textAlign: 'center' },
  exerciseMeta: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },

  manualView: { alignItems: 'center', gap: Spacing.lg, backgroundColor: c.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: c.border, padding: Spacing.xl },
  restHint: { ...Typography.caption, color: c.textTertiary },

  restView: { alignItems: 'center', gap: Spacing.md },
  restLabel: { ...Typography.tiny, color: c.textTertiary, letterSpacing: 2 },
  timerTouchable: { alignItems: 'center', justifyContent: 'center', minWidth: 120, minHeight: 80 },
  nextUpLabel: { ...Typography.body, color: c.textTertiary },
  skipRestBtn: { marginTop: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.full, borderWidth: 1, borderColor: c.border },
  skipRestText: { ...Typography.captionBold, color: c.textSecondary },

  // Actual reps
  actualRepsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  actualRepsLabel: { ...Typography.tiny, color: c.textTertiary, letterSpacing: 1 },
  actualRepsInput: { ...Typography.h3, color: c.textPrimary, borderWidth: 1.5, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4, minWidth: 56, textAlign: 'center' },
  actualRepsUnilateral: { flexDirection: 'row', gap: Spacing.md },
  actualRepsSide: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  actualRepsSideLabel: { ...Typography.captionBold, color: c.textSecondary },

  bottomActions: { padding: Spacing.lg, gap: Spacing.sm },
  doneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderRadius: Radius.full, paddingVertical: 18, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  doneBtnText: { ...Typography.h3, color: '#fff' },
  skipExerciseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.xs },
  skipExerciseBtnText: { ...Typography.caption, color: c.textTertiary },
  prevSkipRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.xl },
  prevSkipBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md },
  prevSkipBtnDisabled: { opacity: 0.25 },
  prevSkipBtnText: { ...Typography.caption, color: c.textTertiary },
  stopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm },
  stopBtnText: { ...Typography.caption, color: c.danger },

  // Completion review
  reviewSection: { width: '100%', gap: Spacing.sm },
  reviewSectionTitle: { ...Typography.tiny, color: c.textTertiary, letterSpacing: 1.5 },
  reviewBlock: { width: '100%', backgroundColor: c.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  reviewBlockLabel: { ...Typography.tiny, fontWeight: '700', letterSpacing: 1.5, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: c.border, gap: Spacing.sm },
  reviewRowSkipped: { opacity: 0.5 },
  reviewRowName: { ...Typography.body, color: c.textPrimary, flex: 1 },
  reviewRowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  reviewRowDetail: { ...Typography.captionBold },
  reviewRowWeight: { ...Typography.caption, color: c.textTertiary },
  reviewRowSkippedText: { ...Typography.caption, color: c.textTertiary },
  reviewEditSection: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm, borderTopWidth: 1, borderTopColor: c.border },
  unskipBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.xs },
  unskipBtnText: { ...Typography.captionBold, color: c.accent },
  markSkippedBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.xs },
  markSkippedBtnText: { ...Typography.captionBold, color: c.textTertiary },
  reviewRowNotReached: { opacity: 0.4 },
  });
}
