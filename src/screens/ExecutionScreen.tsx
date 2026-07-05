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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { useKeepAwake } from 'expo-keep-awake';
import { useAppContext } from '../context/AppContext';
import { useSettings } from '../context/SettingsContext';
import { WorkoutItem, WorkoutLog, ItemLog } from '../models';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { generateId, formatDuration, blockDim, getBlockDisplayColor, getBlockDisplayLabel } from '../utils/helpers';
import { scheduleAlarm, cancelAlarm } from '../utils/notifications';
import NumericInput from '../components/common/NumericInput';
import ExerciseDetailModal from '../components/exercises/ExerciseDetailModal';

type Phase = 'idle' | 'exercise' | 'rest' | 'emom' | 'done' | 'stopped';

interface SavedState {
  phase: Phase;
  blockIdx: number;
  manualIdx: number;
  manualSetIdx: number;
  restSeconds: number;
  emomStep: number;
  emomSeconds: number;
  exerciseTimerSeconds: number;
}

export default function ExecutionScreen() {
  const { templates, activeWorkoutIds, saveLog, exercises } = useAppContext();
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const activeTemplates = templates.filter((t) => activeWorkoutIds.includes(t.id));
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const template = templates.find(
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
  // Actual reps/weights per exercise (key: `${blockId}-${idx}` or `-L`/`-R` suffix)
  const [actualReps, setActualReps] = useState<Record<string, number>>({});
  const [actualWeights, setActualWeights] = useState<Record<string, number>>({});
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
  const phaseRef = useRef(phase);
  const blockIdxRef = useRef(blockIdx);
  const emomSecondsRef = useRef(emomSeconds);
  const restSecondsRef = useRef(restSeconds);
  const exerciseTimerSecondsRef = useRef(0);
  const restTypeRef = useRef<'sets' | 'exercises'>('exercises');
  const savedStateRef = useRef<SavedState | null>(null);
  const savingRef = useRef(false);
  const [hasSaved, setHasSaved] = useState(false);
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

  // ── Start timer ─────────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    stopTimer();
    intervalRef.current = setInterval(() => {
      const p = phaseRef.current;

      if (p === 'rest') {
        const s = restSecondsRef.current - 1;
        if (s > 0 && s % 30 === 0) { playWarning(); }
        if (s > 0 && s <= 3) { playTick(); }
        if (s <= 0) {
          setRestSeconds(0);
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
      } else if (p === 'exercise' && exerciseTimerSecondsRef.current > 0) {
        // Duration-based exercise countdown
        const s = exerciseTimerSecondsRef.current - 1;
        if (s > 0 && s % 30 === 0) { playWarning(); }
        if (s > 0 && s <= 3) { playTick(); }
        if (s <= 0) {
          setExerciseTimerSeconds(0);
          exerciseTimerSecondsRef.current = 0;
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
            setRestSeconds(item.restTime);
            setPhase('rest');
            restTypeRef.current = isLastSet ? 'exercises' : 'sets';
            startTimer();
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

  const startAlarmInterval = useCallback(() => {
    stopAlarmInterval();
    alarmIntervalRef.current = setInterval(() => {
      const s = alarmCountdownSecsRef.current - 1;
      if (s <= 0) {
        stopAlarmInterval();
        setAlarmCountdownSecs(0);
        alarmCountdownSecsRef.current = 0;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        setAlarmCountdownSecs(s);
        alarmCountdownSecsRef.current = s;
      }
    }, 1000);
  }, [stopAlarmInterval]);

  // ── Auto-start duration exercise timer when entering a new exercise ─────────
  useEffect(() => {
    if (phase !== 'exercise') return;
    if (!template) return;
    const currentBlock = template.blocks[blockIdx];
    if (!currentBlock) return;
    const item = currentBlock.items[manualIdx];
    if ((item?.durationSeconds ?? 0) > 0) {
      if (exerciseTimerSecondsRef.current > 0) {
        startTimer();
        return;
      }
      const dur = item!.durationSeconds!;
      setExerciseTimerSeconds(dur);
      exerciseTimerSecondsRef.current = dur;
      startTimer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualIdx, manualSetIdx, phase, blockIdx]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => () => stopTimer(), [stopTimer]);
  useEffect(() => () => stopAlarmInterval(), [stopAlarmInterval]);

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
    if (manualIdx >= currentBlock.items.length) {
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

  const handleStart = () => {
    if (!template) return;
    const firstBlock = template.blocks[0];
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
    setEditingField(null);
    setExerciseTimerSeconds(0);
    exerciseTimerSecondsRef.current = 0;
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

  // ── Standalone alarm countdown actions ──────────────────────────────────────

  const handleStartAlarm = useCallback(async () => {
    if (!template?.alarmMinutes) return;
    const seconds = template.alarmMinutes * 60;
    alarmCountdownSecsRef.current = seconds;
    setAlarmCountdownSecs(seconds);
    setAlarmCountdownPaused(false);
    scheduleAlarm(template.alarmMinutes, template.name).then((id) => {
      setAlarmNotifId(id);
    }).catch(() => {});
    startAlarmInterval();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [template, startAlarmInterval]);

  const handlePauseAlarm = useCallback(() => {
    stopAlarmInterval();
    setAlarmCountdownPaused(true);
    setAlarmNotifId((id) => { if (id) cancelAlarm(id); return null; });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [stopAlarmInterval]);

  const handleResumeAlarm = useCallback(() => {
    if (alarmCountdownSecsRef.current <= 0 || !template) return;
    setAlarmCountdownPaused(false);
    scheduleAlarm(alarmCountdownSecsRef.current / 60, template.name).then((id) => {
      setAlarmNotifId(id);
    }).catch(() => {});
    startAlarmInterval();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [template, startAlarmInterval]);

  const handleStopAlarm = useCallback(() => {
    stopAlarmInterval();
    setAlarmCountdownSecs(null);
    alarmCountdownSecsRef.current = 0;
    setAlarmCountdownPaused(false);
    setAlarmNotifId((id) => { if (id) cancelAlarm(id); return null; });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [stopAlarmInterval]);

  const handleManualDone = () => {
    if (!template) return;
    const currentBlock = template.blocks[blockIdx];
    if (!currentBlock) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setExerciseTimerSeconds(0);
    exerciseTimerSecondsRef.current = 0;
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
      setRestSeconds(item.restTime);
      setPhase('rest');
      restTypeRef.current = isLastSet ? 'exercises' : 'sets';
      startTimer();
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
    stopTimer();
    setExerciseTimerSeconds(0);
    exerciseTimerSecondsRef.current = 0;
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
    stopTimer();
    setExerciseTimerSeconds(0);
    exerciseTimerSecondsRef.current = 0;
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
    stopTimer();
    if (restTypeRef.current === 'sets') {
      setManualSetIdx((si) => si + 1);
    } else {
      setManualIdx((i) => i + 1);
      setManualSetIdx(0);
    }
    setPhase('exercise');
  };

  const handleTogglePause = () => {
    if (isPaused) {
      setIsPaused(false);
      startTimer();
    } else {
      setIsPaused(true);
      stopTimer();
    }
  };

  const openDetail = (name: string) => {
    setDetailExerciseName(name);
    const timerIsRunning =
      (phase === 'rest' || phase === 'emom' || (phase === 'exercise' && exerciseTimerSeconds > 0)) &&
      !isPaused;
    if (timerIsRunning) {
      setIsPaused(true);
      stopTimer();
      pausedForDetailRef.current = true;
    }
  };

  const closeDetail = () => {
    setDetailExerciseName(null);
    if (pausedForDetailRef.current) {
      pausedForDetailRef.current = false;
      setIsPaused(false);
      startTimer();
    }
  };

  const handleStop = () => {
    // Cancel any scheduled alarm
    if (alarmNotifId) { cancelAlarm(alarmNotifId); setAlarmNotifId(null); }
    savedStateRef.current = {
      phase,
      blockIdx,
      manualIdx,
      manualSetIdx,
      restSeconds,
      emomStep,
      emomSeconds,
      exerciseTimerSeconds: exerciseTimerSecondsRef.current,
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
    setEmomStep(saved.emomStep);
    setEmomSeconds(saved.emomSeconds);
    setIsPaused(false);
    exerciseTimerSecondsRef.current = saved.exerciseTimerSeconds;
    if (saved.exerciseTimerSeconds > 0) {
      setExerciseTimerSeconds(saved.exerciseTimerSeconds);
    }
    savedStateRef.current = null;
    setWorkoutEndedAt(null);
    if (saved.phase === 'emom' || saved.phase === 'rest') {
      startTimer();
    }
  };

  const handleDiscard = () => {
    savedStateRef.current = null;
    stopTimer();
    setPhase('idle');
    setNote('');
    setActualReps({});
    setActualWeights({});
    setCompletedByBlock({});
    setSkippedByBlock({});
    setEmomCompletedByBlock({});
    setEmomSkippedByBlock({});
    setEditingField(null);
    setExerciseTimerSeconds(0);
    exerciseTimerSecondsRef.current = 0;
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
      } else {
        const completedIdx = completedByBlock[block.id] ?? [];
        const skippedIdx = skippedByBlock[block.id] ?? [];
        block.items.forEach((item, idx) => {
          const key = `${block.id}-${idx}`;
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
    try {
      await saveLog(log);
    } catch (e) {
      savingRef.current = false;
      throw e;
    }
    setHasSaved(true);
    savedStateRef.current = null;
    stopTimer();
    setPhase('idle');
    setNote('');
    setActualReps({});
    setActualWeights({});
    setCompletedByBlock({});
    setSkippedByBlock({});
    setEmomCompletedByBlock({});
    setEmomSkippedByBlock({});
    setEditingField(null);
    setExerciseTimerSeconds(0);
    exerciseTimerSecondsRef.current = 0;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Derived display values
  // ─────────────────────────────────────────────────────────────────────────────

  const currentBlock = template?.blocks[blockIdx] ?? null;

  const currentItem: WorkoutItem | null = (() => {
    if (!currentBlock) return null;
    if (phase === 'exercise' || phase === 'rest') {
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  if (!template && activeTemplates.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Execution</Text>
        </View>
        <View style={styles.emptyCenter}>
          <Ionicons name="timer-outline" size={72} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No workout selected</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
            Go to the Workout tab, select a template, then come back here to run it.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'idle') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Execution</Text>
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.idleScrollContent}>
          {/* ── Workout picker ── */}
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
            {template!.blocks
              .filter((block) => block.items.length > 0)
              .map((block, idx, arr) => (
                <SummaryRow
                  key={block.id}
                  color={getBlockDisplayColor(block)}
                  label={getBlockDisplayLabel(block)}
                  value={
                    block.type === 'emom'
                      ? `${block.items.length} exercises · ${block.emomMinutes} min`
                      : `${block.items.length} exercise${block.items.length !== 1 ? 's' : ''}`
                  }
                  isLast={idx === arr.length - 1}
                />
              ))}
          </View>
        </ScrollView>
        <View style={styles.idleBottomActions}>
          {alarmCountdownSecs !== null ? (
            /* ── Countdown active ── */
            <View style={styles.alarmCountdown}>
              <View style={styles.alarmCountdownHeader}>
                <Ionicons name="alarm-outline" size={20} color={colors.warning} />
                <Text style={styles.alarmCountdownTime}>
                  {alarmCountdownSecs > 0 ? formatDuration(alarmCountdownSecs) : 'Alarm!'}
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
          <View style={styles.startRow}>
            <TouchableOpacity
              style={[styles.startBtn, template!.alarmMinutes ? styles.startBtnCompact : null]}
              onPress={handleStart}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={22} color="#fff" />
              <Text style={styles.startBtnText}>Start Workout</Text>
            </TouchableOpacity>
            {template!.alarmMinutes && alarmCountdownSecs === null && (
              <TouchableOpacity style={styles.alarmFab} onPress={handleStartAlarm} activeOpacity={0.8}>
                <Ionicons name="alarm-outline" size={28} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
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
                            actualReps={actualReps} actualWeights={actualWeights}
                            expandedKey={reviewExpandedKey}
                            onToggle={() => setReviewExpandedKey(reviewExpandedKey === rowKey ? null : rowKey)}
                            onChangeReps={(k, v) => setActualReps((prev) => ({ ...prev, [k]: v }))}
                            onChangeWeight={(k, v) => setActualWeights((prev) => ({ ...prev, [k]: v }))}
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
                            actualReps={actualReps} actualWeights={actualWeights}
                            expandedKey={reviewExpandedKey}
                            onToggle={() => setReviewExpandedKey(reviewExpandedKey === key ? null : key)}
                            onChangeReps={(k, v) => setActualReps((prev) => ({ ...prev, [k]: v }))}
                            onChangeWeight={(k, v) => setActualWeights((prev) => ({ ...prev, [k]: v }))}
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
  const isDurationExercise = exerciseTimerSeconds > 0;

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
    const nextItem = currentBlock.items[manualIdx + 1];
    if (nextItem) return nextItem.exerciseName;
    const nextBlock = template.blocks[blockIdx + 1];
    return nextBlock ? getBlockDisplayLabel(nextBlock) : 'Done';
  })();

  const doneBtnLabel = (() => {
    const item = currentBlock?.items[manualIdx];
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
              ? `Alarm in ${formatDuration(alarmCountdownSecs)}`
              : `Alarm in ${template?.alarmMinutes} min`}
          </Text>
          <TouchableOpacity
            style={styles.alarmCancelBtn}
            onPress={() => { cancelAlarm(alarmNotifId); setAlarmNotifId(null); stopAlarmInterval(); setAlarmCountdownSecs(null); setAlarmCountdownPaused(false); }}
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
          // Starter / finisher manual
          <View style={styles.manualView}>
            {currentItem && (
              <>
                <TouchableOpacity onPress={() => openDetail(currentItem.exerciseName)} activeOpacity={0.7}>
                  <Text style={styles.exerciseName}>{currentItem.exerciseName}</Text>
                </TouchableOpacity>

                {/* Duration exercise: show countdown ring */}
                {isDurationExercise && (
                  <TouchableOpacity onPress={handleTogglePause} activeOpacity={0.8}
                    style={[styles.timerRing, { borderColor: `${color}44` }]}>
                    {isPaused
                      ? <Ionicons name="pause" size={72} color={color} />
                      : <><Text style={[styles.timerBig, { color }]}>{exerciseTimerSeconds}</Text>
                          <Text style={styles.timerSub}>seconds</Text></>
                    }
                  </TouchableOpacity>
                )}

                <View style={styles.exerciseMeta}>
                  {(currentItem.durationSeconds ?? 0) > 0 ? (
                    <MetaPill value={`${currentItem.durationSeconds}s`} label="DURATION" color={color} />
                  ) : (
                    <MetaPill
                      value={`${currentItem.reps}${currentItem.repMode !== 'bilateral' ? ' x 2' : ''}`}
                      label="REPS"
                      color={color}
                      onPress={() => setEditingField(editingField === 'reps' ? null : 'reps')}
                      active={editingField === 'reps'}
                    />
                  )}
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

                {editingField === 'reps' && (currentItem.durationSeconds ?? 0) === 0 && (
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
        {/* Done button: not shown during rest, EMOM, or while a duration timer is running */}
        {!isRestPhase && phase !== 'emom' && !isDurationExercise && (
          <TouchableOpacity style={[styles.doneBtn, { backgroundColor: color }]}
            onPress={handleManualDone} activeOpacity={0.8}>
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

function CompletionExerciseRow({
  rowKey,
  repsKey,
  item,
  label,
  isSkipped,
  isNotReached,
  actualReps,
  actualWeights,
  expandedKey,
  onToggle,
  onChangeReps,
  onChangeWeight,
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
  expandedKey: string | null;
  onToggle: () => void;
  onChangeReps: (key: string, value: number) => void;
  onChangeWeight: (key: string, value: number) => void;
  onUnskip?: () => void;
  onMarkSkipped?: () => void;
  color: string;
}) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const isOpen = expandedKey === rowKey;
  const canEditReps = (item.durationSeconds ?? 0) === 0;

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

  const displayReps = canEditReps
    ? item.repMode !== 'bilateral'
      ? `${actualReps[`${repsKey}-L`] ?? item.reps}${item.repMode === 'unilateral-fr' ? 'F' : 'L'} / ${actualReps[`${repsKey}-R`] ?? item.reps}R`
      : `${actualReps[repsKey] ?? item.reps} reps`
    : `${item.durationSeconds}s`;
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
          {canEditReps && (
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
