import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Exercise, Objective, ObjectiveMetricType } from '../../models';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import { useSettings } from '../../context/SettingsContext';
import { generateId } from '../../utils/helpers';
import { ALL_METRIC_TYPES, getMetric } from '../../utils/objectives';
import ExercisePickerModal from '../exercises/ExercisePickerModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreate: (objective: Objective) => void;
}

/**
 * Create a new measurable objective in-app.
 *
 * 1. Pick a metric type (max_reps / max_weight / body_fat).
 * 2. For rep/weight metrics, pick an exercise from the library (required for
 *    max_reps, optional scope for max_weight).
 * 3. Set a target value.
 */
export default function AddObjectiveModal({ visible, onClose, onCreate }: Props) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);

  const [metricType, setMetricType] = useState<ObjectiveMetricType>('max_reps');
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [target, setTarget] = useState<string>('');
  const [showExercisePicker, setShowExercisePicker] = useState(false);

  const metric = getMetric(metricType);
  const needsExercise = metricType === 'max_reps' || metricType === 'max_weight';
  const exerciseRequired = metricType === 'max_reps';

  const targetNum = parseFloat(target);
  const targetValid = !isNaN(targetNum) && targetNum > 0;
  const exerciseValid = !exerciseRequired || exercise !== null;
  const canSave = targetValid && exerciseValid;

  const reset = () => {
    setMetricType('max_reps');
    setExercise(null);
    setTarget('');
    setShowExercisePicker(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = () => {
    if (!canSave) return;
    const objective: Objective = {
      id: generateId(),
      metricType,
      target: targetNum,
      exerciseName: exercise?.name,
      createdAt: new Date().toISOString(),
    };
    onCreate(objective);
    reset();
  };

  return (
    <>
      {/* Hide the form sheet while the exercise picker is open. Rendering two
       *  full-screen Modals at once is unreliable on RN (the nested one fails to
       *  show / receive touches). This component stays mounted the whole time,
       *  so the in-progress form state (metric, target, exercise) is preserved
       *  across the picker round-trip. */}
      <Modal visible={visible && !showExercisePicker} animationType="slide" transparent onRequestClose={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={[styles.headerBtn, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>New objective</Text>
              <TouchableOpacity onPress={handleSave} disabled={!canSave} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={[styles.headerBtn, { color: canSave ? colors.accent : colors.textTertiary }]}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Metric type */}
              <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>WHAT TO TRACK</Text>
              <View style={styles.typeRow}>
                {ALL_METRIC_TYPES.map((type) => {
                  const def = getMetric(type);
                  const active = type === metricType;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeChip,
                        {
                          borderColor: active ? colors.accent : colors.border,
                          backgroundColor: active ? colors.accentDim : 'transparent',
                        },
                      ]}
                      onPress={() => {
                        setMetricType(type);
                        // body_fat has no exercise; clear any stale selection.
                        if (type === 'body_fat') setExercise(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={(def.icon as any)} size={14} color={active ? colors.accent : colors.textSecondary} />
                      <Text style={[styles.typeChipText, { color: active ? colors.accent : colors.textSecondary }]}>
                        {def.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Exercise picker (max_reps / max_weight) */}
              {needsExercise && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
                    EXERCISE {exerciseRequired ? '' : '(OPTIONAL)'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.pickerRow, { borderColor: colors.border, backgroundColor: colors.background }]}
                    onPress={() => setShowExercisePicker(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={exercise ? 'barbell-outline' : 'search-outline'}
                      size={16}
                      color={colors.textSecondary}
                    />
                    <Text
                      style={[styles.pickerText, { color: exercise ? colors.textPrimary : colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      {exercise ? exercise.name : 'Select an exercise…'}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                </>
              )}

              {/* Target */}
              <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>TARGET ({metric.unit.toUpperCase()})</Text>
              <View style={[styles.targetRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <TextInput
                  style={[styles.targetInput, { color: colors.textPrimary }]}
                  value={target}
                  onChangeText={setTarget}
                  placeholder="e.g. 20"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
                <Text style={[styles.targetUnit, { color: colors.textTertiary }]}>{metric.unit}</Text>
              </View>

              {/* Live preview */}
              {targetValid && (exercise || !exerciseRequired) && (
                <View style={[styles.preview, { backgroundColor: colors.accentDim }]}>
                  <Ionicons name="flag-outline" size={14} color={colors.accent} />
                  <Text style={[styles.previewText, { color: colors.accent }]}>
                    {metricType === 'body_fat'
                      ? `${metric.label} under ${targetNum} ${metric.unit}`
                      : exercise
                      ? `${exercise.name}: reach ${targetNum} ${metric.unit}`
                      : `${metric.label}: lift ${targetNum} ${metric.unit}`}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showExercisePicker && (
        <ExercisePickerModal
          onClose={() => setShowExercisePicker(false)}
          onSelect={(ex) => {
            setExercise(ex);
            setShowExercisePicker(false);
          }}
        />
      )}
    </>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      maxHeight: '85%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.sm,
    },
    headerBtn: { ...Typography.bodyBold, width: 60 },
    headerTitle: { ...Typography.h3 },
    content: {
      padding: Spacing.lg,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xl,
      gap: Spacing.sm,
    },
    fieldLabel: {
      ...Typography.tiny,
      letterSpacing: 1.2,
      marginTop: Spacing.xs,
    },
    typeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 9,
      borderRadius: Radius.full,
      borderWidth: 1,
    },
    typeChipText: { ...Typography.captionBold },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: 14,
      borderRadius: Radius.md,
      borderWidth: 1,
    },
    pickerText: { flex: 1, ...Typography.body },
    targetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: 4,
      borderRadius: Radius.md,
      borderWidth: 1,
    },
    targetInput: { flex: 1, ...Typography.body, paddingVertical: 10 },
    targetUnit: { ...Typography.caption, marginLeft: 4 },
    preview: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.md,
      marginTop: Spacing.xs,
    },
    previewText: { ...Typography.captionBold, flex: 1 },
  });
}
