import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Objective } from '../../models';
import { Colors, Spacing, Typography } from '../../theme';
import { useSettings } from '../../context/SettingsContext';
import ProgressBar from '../common/ProgressBar';
import {
  ObjectiveProgress,
  formatCurrentValue,
  getMetric,
  objectiveSubtitle,
  objectiveTitle,
} from '../../utils/objectives';

interface Props {
  objective: Objective;
  progress: ObjectiveProgress;
  onDelete: (id: string) => void;
  /** Open the objective in the editor. Tapping the card body triggers this. */
  onEdit: (objective: Objective) => void;
}

/**
 * One measurable-objective row: icon + title + current/target value + progress
 * bar. Tapping the card body opens the editor (full edit); the trailing ×
 * removes the objective. Parent owns the data mutations.
 */
export default function ObjectiveCard({ objective, progress, onDelete, onEdit }: Props) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const metric = getMetric(objective.metricType);

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.bodyBtn} onPress={() => onEdit(objective)} activeOpacity={0.6}>
        <View style={[styles.iconBadge, { backgroundColor: progress.done ? colors.successDim : colors.accentDim }]}>
          <Ionicons
            name={(metric.icon as any) || 'flag-outline'}
            size={16}
            color={progress.done ? colors.success : colors.accent}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {objectiveTitle(objective)}
            </Text>
            <Text style={[styles.target, { color: progress.done ? colors.success : colors.textSecondary }]}>
              {formatCurrentValue(progress.current, objective.metricType)} /{' '}
              {objective.target} {metric.unit}
            </Text>
          </View>

          <Text style={[styles.subtitle, { color: colors.textTertiary }]} numberOfLines={1}>
            {progress.done ? 'Goal reached 🎉' : objectiveSubtitle(objective)}
          </Text>

          <View style={styles.barWrap}>
            <ProgressBar progress={progress.pct} done={progress.done} />
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => onDelete(objective.id)}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        style={styles.deleteBtn}
      >
        <Ionicons name="close" size={16} color={colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
    // The tappable region covering the icon + content. Uses flex: 1 so the
    // delete button on the right keeps its own fixed touch target.
    bodyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flex: 1,
    },
    iconBadge: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      gap: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    title: {
      ...Typography.bodyBold,
      flexShrink: 1,
    },
    target: {
      ...Typography.caption,
      fontWeight: '600',
    },
    subtitle: {
      ...Typography.caption,
    },
    barWrap: {
      marginTop: 2,
    },
    deleteBtn: {
      padding: Spacing.xs,
    },
  });
}
