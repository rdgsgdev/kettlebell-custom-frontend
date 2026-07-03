import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Exercise } from '../../models';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import { CATEGORY_LABELS, CATEGORY_COLORS, MUSCLE_LABELS } from '../../utils/exercises';
import SwipeableRow from '../common/SwipeableRow';
import { useSettings } from '../../context/SettingsContext';

interface Props {
  exercise: Exercise;
  onPress: () => void;
  onDelete: () => void;
}

export default function ExerciseCard({ exercise, onPress, onDelete }: Props) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const color = CATEGORY_COLORS[exercise.category];
  const primaryMuscles = exercise.muscles.filter((m) => m.isPrimary).slice(0, 3);

  return (
    <SwipeableRow onDelete={onDelete}>
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View style={styles.left}>
          <View style={[styles.categoryDot, { backgroundColor: `${color}28`, borderColor: color }]}>
            <Text style={[styles.categoryInitial, { color }]}>
              {CATEGORY_LABELS[exercise.category][0]}
            </Text>
          </View>
        </View>

        <View style={styles.center}>
          <Text style={styles.name} numberOfLines={1}>{exercise.name}</Text>
          <View style={styles.meta}>
            <View style={[styles.badge, { backgroundColor: `${color}22` }]}>
              <Text style={[styles.badgeText, { color }]}>
                {CATEGORY_LABELS[exercise.category]}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {exercise.repMode === 'unilateral-fr'
                  ? 'F/R'
                  : exercise.repMode === 'unilateral'
                  ? 'L/R'
                  : 'Bilateral'}
              </Text>
            </View>
          </View>
          {primaryMuscles.length > 0 && (
            <Text style={styles.muscles} numberOfLines={1}>
              {primaryMuscles.map((m) => MUSCLE_LABELS[m.group]).join(' · ')}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </SwipeableRow>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      padding: Spacing.md,
      gap: Spacing.md,
    },
    left: { alignItems: 'center', justifyContent: 'center' },
    categoryDot: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryInitial: { ...Typography.h3 },
    center: { flex: 1, gap: 4 },
    name: { ...Typography.bodyBold, color: c.textPrimary },
    meta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    badge: {
      backgroundColor: c.surfaceElevated,
      borderRadius: Radius.full,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    badgeText: { ...Typography.tiny, color: c.textSecondary, fontWeight: '600' },
    muscles: { ...Typography.caption, color: c.textTertiary },
  });
}
