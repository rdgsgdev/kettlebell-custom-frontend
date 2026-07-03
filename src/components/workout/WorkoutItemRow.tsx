import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { WorkoutItem, RepMode, Exercise } from '../../models';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import NumericInput from '../common/NumericInput';
import ExercisePickerModal from '../exercises/ExercisePickerModal';
import ExerciseDetailModal from '../exercises/ExerciseDetailModal';
import SwipeableRow from '../common/SwipeableRow';
import { useAppContext } from '../../context/AppContext';
import { useSettings } from '../../context/SettingsContext';

interface Props {
  item: WorkoutItem;
  index: number;
  showRestTime: boolean;
  accentColor: string;
  onUpdate: (patch: Partial<WorkoutItem>) => void;
  onDelete: () => void;
  isDragging?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export default function WorkoutItemRow({
  item,
  index,
  showRestTime,
  accentColor,
  onUpdate,
  onDelete,
  isDragging = false,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
}: Props) {
  const { exercises } = useAppContext();
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const [expanded, setExpanded] = useState(item.exerciseName === '');
  const [showPicker, setShowPicker] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const libraryExercise = exercises.find(
    (e) => e.name.toLowerCase() === item.exerciseName.toLowerCase()
  ) ?? null;

  // ── Drag ─────────────────────────────────────────────────────────────────────
  const isDragActiveRef = useRef(false);
  const accDyRef = useRef(0);
  const lastDyRef = useRef(0);
  const onMoveUpRef = useRef(onMoveUp);
  const onMoveDownRef = useRef(onMoveDown);
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);
  onMoveUpRef.current = onMoveUp;
  onMoveDownRef.current = onMoveDown;
  onDragStartRef.current = onDragStart;
  onDragEndRef.current = onDragEnd;

  const dragPanResponder = useRef(
    PanResponder.create({
      // Only capture movement once drag is active (long press fired)
      onMoveShouldSetPanResponder: () => isDragActiveRef.current,
      onPanResponderGrant: () => {
        lastDyRef.current = 0;
        accDyRef.current = 0;
      },
      onPanResponderMove: (_, { dy }) => {
        if (!isDragActiveRef.current) return;
        const delta = dy - lastDyRef.current;
        lastDyRef.current = dy;
        accDyRef.current += delta;
        const THRESHOLD = 48;
        if (accDyRef.current > THRESHOLD) {
          accDyRef.current -= THRESHOLD;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onMoveDownRef.current?.();
        } else if (accDyRef.current < -THRESHOLD) {
          accDyRef.current += THRESHOLD;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onMoveUpRef.current?.();
        }
      },
      onPanResponderRelease: () => {
        isDragActiveRef.current = false;
        onDragEndRef.current?.();
      },
      onPanResponderTerminate: () => {
        isDragActiveRef.current = false;
        onDragEndRef.current?.();
      },
    })
  ).current;

  // Float animation
  const scaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isDragging ? 1.03 : 1,
      useNativeDriver: true,
      tension: 300,
      friction: 20,
    }).start();
  }, [isDragging]);

  const handleSelectExercise = (exercise: Exercise) => {
    onUpdate({ exerciseName: exercise.name, repMode: exercise.repMode });
    setShowPicker(false);
  };

  return (
    <>
      {showPicker && (
        <ExercisePickerModal
          currentName={item.exerciseName}
          onSelect={handleSelectExercise}
          onClose={() => setShowPicker(false)}
        />
      )}
      <ExerciseDetailModal
        exercise={showDetail ? libraryExercise : null}
        onClose={() => setShowDetail(false)}
      />
      <Animated.View
        style={[
          styles.outerRow,
          { marginBottom: Spacing.sm, transform: [{ scale: scaleAnim }] },
          isDragging && {
            zIndex: 10,
            elevation: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            backgroundColor: colors.surfaceElevated,
            borderRadius: Radius.md,
          },
        ]}
        {...dragPanResponder.panHandlers}
      >
        <SwipeableRow onDelete={onDelete} borderRadius={Radius.md} compact={!expanded}>
          <View style={[styles.container, isDragging && { borderColor: accentColor }]}>
      <TouchableOpacity
        onPress={() => setExpanded((e) => !e)}
        onLongPress={() => {
          isDragActiveRef.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onDragStartRef.current?.();
        }}
        delayLongPress={500}
        activeOpacity={0.8}
        style={styles.mainRow}
      >
        <View style={[styles.indexDot, { backgroundColor: accentColor }]}>
          <Text style={styles.indexText}>{index + 1}</Text>
        </View>

        <TextInput
          style={styles.nameInput}
          value={item.exerciseName}
          onChangeText={(exerciseName) => onUpdate({ exerciseName })}
          placeholder="Exercise name"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
          onFocus={() => setExpanded(true)}
        />

        <TouchableOpacity
          onPress={() => setShowPicker(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="library-outline" size={17} color={colors.textTertiary} />
        </TouchableOpacity>

        {!!libraryExercise && (
          <TouchableOpacity
            onPress={() => setShowDetail(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="eye-outline" size={17} color={colors.textTertiary} />
          </TouchableOpacity>
        )}

        <View style={styles.rowRight}>
          <Text style={styles.quickInfo}>
            {(item.durationSeconds ?? 0) > 0
              ? `${item.durationSeconds}s`
              : `${item.reps}r${item.repMode !== 'bilateral' ? '×2' : ''}${item.weight > 0 ? ` · ${item.weight}kg` : ''}`}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textTertiary}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.details}>
          {/* Exercise type: Reps or Timer — only for starter/finisher */}
          {showRestTime && (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.toggleGroup}>
                {(['reps', 'timer'] as const).map((type) => {
                  const isActive = type === 'timer'
                    ? (item.durationSeconds ?? 0) > 0
                    : (item.durationSeconds ?? 0) === 0;
                  return (
                    <TouchableOpacity
                      key={type}
                      onPress={() => {
                        if (type === 'timer') {
                          onUpdate({ durationSeconds: 60, reps: 0 });
                        } else {
                          onUpdate({ durationSeconds: 0, reps: item.reps || 10 });
                        }
                      }}
                      activeOpacity={0.7}
                      style={[
                        styles.toggleBtn,
                        isActive && { borderColor: accentColor, backgroundColor: `${accentColor}22` },
                      ]}
                    >
                      <Text style={[styles.toggleText, isActive && { color: accentColor }]}>
                        {type === 'reps' ? 'Reps' : 'Timer'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Rep mode */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Mode</Text>
            <View style={styles.toggleGroup}>
              {(['bilateral', 'unilateral', 'unilateral-fr'] as RepMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  onPress={() => onUpdate({ repMode: mode })}
                  activeOpacity={0.7}
                  style={[
                    styles.toggleBtn,
                    item.repMode === mode && {
                      borderColor: accentColor,
                      backgroundColor: `${accentColor}22`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      item.repMode === mode && { color: accentColor },
                    ]}
                  >
                    {mode === 'bilateral' ? 'Bilateral' : mode === 'unilateral' ? 'L/R' : 'F/R'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Numeric fields */}
          <View style={styles.numericRow}>
            {(item.durationSeconds ?? 0) > 0 ? (
              <View style={styles.numericField}>
                <Text style={styles.fieldLabel}>Duration (s)</Text>
                <NumericInput
                  style={styles.numericInput}
                  value={item.durationSeconds ?? 60}
                  onCommit={(n) => onUpdate({ durationSeconds: n })}
                  min={1}
                  returnKeyType="done"
                  selectTextOnFocus
                />
              </View>
            ) : (
              <>
                <View style={styles.numericField}>
                  <Text style={styles.fieldLabel}>Reps</Text>
                  <NumericInput
                    style={styles.numericInput}
                    value={item.reps}
                    onCommit={(n) => onUpdate({ reps: n })}
                    min={1}
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                </View>
                {showRestTime && (
                  <View style={styles.numericField}>
                    <Text style={styles.fieldLabel}>Sets</Text>
                    <NumericInput
                      style={styles.numericInput}
                      value={item.sets ?? 1}
                      onCommit={(n) => onUpdate({ sets: n })}
                      min={1}
                      returnKeyType="done"
                      selectTextOnFocus
                    />
                  </View>
                )}
              </>
            )}
            <View style={styles.numericField}>
              <Text style={styles.fieldLabel}>Weight (kg)</Text>
              <NumericInput
                style={styles.numericInput}
                value={item.weight}
                onCommit={(n) => onUpdate({ weight: n })}
                isFloat
                returnKeyType="done"
                selectTextOnFocus
              />
            </View>
            {showRestTime && (
              <View style={styles.numericField}>
                <Text style={styles.fieldLabel}>Rest (s)</Text>
                <NumericInput
                  style={styles.numericInput}
                  value={item.restTime}
                  onCommit={(n) => onUpdate({ restTime: n })}
                  returnKeyType="done"
                  selectTextOnFocus
                />
              </View>
            )}
          </View>
        </View>
      )}
        </View>
        </SwipeableRow>
      </Animated.View>
    </>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    outerRow: {
      // wrapper for drag gesture + float animation
    },
    container: {
      backgroundColor: c.surfaceElevated,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    mainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: Spacing.sm,
      gap: Spacing.sm,
    },
    indexDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    indexText: {
      ...Typography.tiny,
      color: '#fff',
      fontWeight: '700',
    },
    nameInput: {
      flex: 1,
      ...Typography.body,
      color: c.textPrimary,
      paddingVertical: 4,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    quickInfo: {
      ...Typography.caption,
      color: c.textTertiary,
    },
    details: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      padding: Spacing.md,
      gap: Spacing.md,
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    fieldLabel: {
      ...Typography.caption,
      color: c.textSecondary,
    },
    toggleGroup: {
      flexDirection: 'row',
      gap: Spacing.xs,
    },
    toggleBtn: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 5,
      borderRadius: Radius.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    toggleText: {
      ...Typography.captionBold,
      color: c.textTertiary,
    },
    numericRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    numericField: {
      flex: 1,
      gap: 4,
    },
    numericInput: {
      ...Typography.bodyBold,
      color: c.textPrimary,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      textAlign: 'center',
    },
  });
}
