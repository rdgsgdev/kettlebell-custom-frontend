import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Exercise } from '../../models';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import { useSettings } from '../../context/SettingsContext';
import { CATEGORY_LABELS, CATEGORY_COLORS, MUSCLE_LABELS } from '../../utils/exercises';
import YoutubePlayer from './YoutubePlayer';

interface Props {
  exercise: Exercise | null;
  onClose: () => void;
}

export default function ExerciseDetailModal({ exercise, onClose }: Props) {
  const { top } = useSafeAreaInsets();
  const { colors } = useSettings();
  const styles = makeStyles(colors);

  if (!exercise) return null;

  const color = CATEGORY_COLORS[exercise.category];
  const primaryMuscles = exercise.muscles.filter((m) => m.isPrimary);
  const secondaryMuscles = exercise.muscles.filter((m) => !m.isPrimary);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: top }]}>
        {/* Nav */}
        <View style={styles.nav}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Exercise Details</Text>
          {/* Spacer to center title */}
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Text style={styles.name}>{exercise.name}</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: color }]}>
              <Text style={[styles.badgeText, { color }]}>
                {CATEGORY_LABELS[exercise.category]}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {exercise.repMode === 'unilateral-fr'
                  ? 'F / R'
                  : exercise.repMode === 'unilateral'
                  ? 'L / R'
                  : 'Bilateral'}
              </Text>
            </View>
          </View>

          {/* Description */}
          {!!exercise.description && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>DESCRIPTION</Text>
              <Text style={styles.description}>{exercise.description}</Text>
            </View>
          )}

          {/* Muscles */}
          {exercise.muscles.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>MUSCLES</Text>
              {primaryMuscles.length > 0 && (
                <View style={styles.muscleGroup}>
                  <Text style={styles.muscleGroupLabel}>Primary</Text>
                  <View style={styles.chips}>
                    {primaryMuscles.map((m) => (
                      <View
                        key={m.group}
                        style={[styles.chip, { borderColor: color, backgroundColor: `${color}22` }]}
                      >
                        <Text style={[styles.chipText, { color }]}>
                          {MUSCLE_LABELS[m.group]}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {secondaryMuscles.length > 0 && (
                <View style={styles.muscleGroup}>
                  <Text style={styles.muscleGroupLabel}>Secondary</Text>
                  <View style={styles.chips}>
                    {secondaryMuscles.map((m) => (
                      <View key={m.group} style={styles.chip}>
                        <Text style={[styles.chipText, { color: colors.textSecondary }]}>
                          {MUSCLE_LABELS[m.group]}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Video */}
          {!!exercise.videoUrl && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>VIDEO</Text>
              <YoutubePlayer url={exercise.videoUrl} />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  navTitle: {
    ...Typography.bodyBold,
    color: c.textPrimary,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: 48,
  },
  name: {
    ...Typography.h1,
    color: c.textPrimary,
  },
  badges: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  badge: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    ...Typography.captionBold,
    color: c.textSecondary,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.tiny,
    color: c.textTertiary,
    letterSpacing: 1,
  },
  description: {
    ...Typography.body,
    color: c.textSecondary,
    lineHeight: 22,
  },
  muscleGroup: {
    gap: 6,
  },
  muscleGroupLabel: {
    ...Typography.captionBold,
    color: c.textTertiary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  chipText: {
    ...Typography.captionBold,
    color: c.textSecondary,
  },
  });
}
