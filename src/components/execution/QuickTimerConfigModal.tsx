import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WorkoutItem } from '../../models';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import { useSettings } from '../../context/SettingsContext';
import BlockSection from '../workout/BlockSection';

// ── Types ────────────────────────────────────────────────────────────────────
export type QuickTimerKind = 'countup' | 'juarez' | 'emom' | 'pr';

export interface QuickTimerConfig {
  kind: QuickTimerKind;
  juarezStartingReps?: number; // juarez only (required)
  juarezSuperset?: boolean;    // juarez only
  emomMinutes?: number;        // emom only (required)
  targetReps?: number;         // pr only (required) — the target rep count
  items: WorkoutItem[];        // optional exercises (all kinds)
}

interface Props {
  kind: QuickTimerKind;
  visible: boolean;
  onCancel: () => void;
  onStart: (config: QuickTimerConfig) => void;
}

// Per-kind display config. Accent colors mirror the quick-timer buttons on the
// Execution screen (Count-up = theme accent, Juarez = teal, EMOM = amber, PR = success green).
const KIND_DISPLAY: Record<
  QuickTimerKind,
  { title: string; accent: (c: typeof Colors) => string; blockLabel: string }
> = {
  countup: {
    title: 'Count-up',
    accent: (c) => c.accent,
    blockLabel: 'Count-up',
  },
  juarez: {
    title: 'Juarez Valley',
    accent: () => '#2DD4BF',
    blockLabel: 'Juarez',
  },
  emom: {
    title: 'EMOM',
    accent: () => '#FBBF24',
    blockLabel: 'EMOM',
  },
  pr: {
    title: 'PR Attempt',
    accent: (c) => c.success,
    blockLabel: 'PR Attempt',
  },
};

export default function QuickTimerConfigModal({ kind, visible, onCancel, onStart }: Props) {
  const { colors } = useSettings();
  const { top } = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const accent = KIND_DISPLAY[kind].accent(colors);

  // Required numeric fields are kept as raw strings so they can start blank and
  // the Start button can stay disabled until a valid value is entered. (The
  // shared NumericInput can't render an empty field — it restores-on-blur.)
  const [repsText, setRepsText] = useState('');   // juarez: starting reps (= rounds)
  const [superset, setSuperset] = useState(false); // juarez: 2-exercise alternating ladder
  const [minutesText, setMinutesText] = useState(''); // emom: total duration
  const [targetRepsText, setTargetRepsText] = useState(''); // pr: target reps (required)
  const [items, setItems] = useState<WorkoutItem[]>([]);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const reps = parseInt(repsText, 10);
  const minutes = parseInt(minutesText, 10);
  const targetReps = parseInt(targetRepsText, 10);
  const canStart =
    kind === 'countup' ||
    (kind === 'juarez' && !isNaN(reps) && reps >= 1) ||
    (kind === 'emom' && !isNaN(minutes) && minutes >= 1) ||
    (kind === 'pr' && !isNaN(targetReps) && targetReps >= 1);

  const handleStart = () => {
    if (!canStart) return;
    onStart({
      kind,
      juarezStartingReps: kind === 'juarez' ? reps : undefined,
      juarezSuperset: kind === 'juarez' ? superset : undefined,
      emomMinutes: kind === 'emom' ? minutes : undefined,
      targetReps: kind === 'pr' ? targetReps : undefined,
      items,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.container, { paddingTop: top }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
          keyboardVerticalOffset={0}
        >
          {/* ─── Header ─── */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{KIND_DISPLAY[kind].title}</Text>
            <TouchableOpacity
              onPress={handleStart}
              disabled={!canStart}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.saveText, !canStart && styles.saveTextDisabled]}>Start</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEnabled={scrollEnabled}
          >
            {/* ─── Required config (juarez / emom only) ─── */}
            {kind === 'juarez' && (
              <View style={[styles.configCard, { borderColor: `${accent}44` }]}>
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>Reps / rounds</Text>
                  <TextInput
                    style={[styles.configInput, { color: accent, borderColor: `${accent}88` }]}
                    value={repsText}
                    onChangeText={setRepsText}
                    placeholder="—"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                </View>
                <Text style={styles.hint}>
                  Juarez Valley ladder: {isNaN(reps) || reps < 1 ? 'N' : reps} rounds
                  ({isNaN(reps) || reps < 1 ? 'N' : reps}, 1, {isNaN(reps) || reps < 1 ? 'N' : reps - 1}, 2 …).
                </Text>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Superset (2 alternating exercises)</Text>
                  <Switch
                    value={superset}
                    onValueChange={setSuperset}
                    trackColor={{ false: colors.border, true: `${accent}66` }}
                    thumbColor={superset ? accent : colors.textTertiary}
                  />
                </View>
              </View>
            )}

            {kind === 'emom' && (
              <View style={[styles.configCard, { borderColor: `${accent}44` }]}>
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>Duration</Text>
                  <TextInput
                    style={[styles.configInput, { color: accent, borderColor: `${accent}88` }]}
                    value={minutesText}
                    onChangeText={setMinutesText}
                    placeholder="—"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                  <Text style={styles.unit}>min</Text>
                </View>
                <Text style={styles.hint}>
                  Every minute on the minute for{' '}
                  {isNaN(minutes) || minutes < 1 ? 'N' : minutes} min.
                </Text>
              </View>
            )}

            {kind === 'pr' && (
              <View style={[styles.configCard, { borderColor: `${accent}44` }]}>
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>Target reps</Text>
                  <TextInput
                    style={[styles.configInput, { color: accent, borderColor: `${accent}88` }]}
                    value={targetRepsText}
                    onChangeText={setTargetRepsText}
                    placeholder="—"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                  <Text style={styles.unit}>reps</Text>
                </View>
                <Text style={styles.hint}>
                  Try to beat or hit{' '}
                  {isNaN(targetReps) || targetReps < 1 ? 'N' : targetReps} reps — your
                  actual count can be edited after.
                </Text>
              </View>
            )}

            {/* ─── Optional exercises ─── */}
            <BlockSection
              title={KIND_DISPLAY[kind].blockLabel}
              blockType={kind === 'countup' ? 'finisher' : kind === 'pr' ? 'mobility' : kind}
              accentColor={accent}
              items={items}
              showRestTime={kind === 'juarez'}
              repsEditable={kind === 'emom'}
              maxItems={kind === 'juarez' ? (superset ? 2 : 1) : kind === 'pr' ? 1 : undefined}
              onChange={setItems}
              onScrollLock={setScrollEnabled}
            />

            <Text style={styles.optionalHint}>
              {kind === 'pr'
                ? 'Pick the exercise above — your target reps drive the attempt.'
                : 'Exercises are optional — skip to run as a bare timer.'}
            </Text>

            <View style={styles.bottomPad} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    cancelText: { ...Typography.body, color: c.textSecondary },
    headerTitle: { ...Typography.h3, color: c.textPrimary },
    saveText: { ...Typography.bodyBold, color: c.accent },
    saveTextDisabled: { color: c.textTertiary },
    content: { padding: Spacing.md, paddingTop: Spacing.lg },
    configCard: {
      flexDirection: 'column',
      backgroundColor: c.surfaceElevated,
      borderRadius: Radius.md,
      borderWidth: 1,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.md,
      gap: Spacing.xs,
    },
    configRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    configLabel: { ...Typography.body, color: c.textSecondary, flex: 1 },
    configInput: {
      ...Typography.h3,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      minWidth: 60,
      textAlign: 'center',
    },
    unit: { ...Typography.body, color: c.textTertiary },
    hint: {
      ...Typography.tiny,
      color: c.textTertiary,
      fontStyle: 'italic',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Spacing.xs,
    },
    toggleLabel: { ...Typography.caption, color: c.textSecondary, flex: 1 },
    optionalHint: {
      ...Typography.caption,
      color: c.textTertiary,
      textAlign: 'center',
      paddingTop: Spacing.md,
    },
    bottomPad: { height: 60 },
  });
}
