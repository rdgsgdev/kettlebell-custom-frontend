import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TargetedMuscle, MuscleGroup } from '../../models';
import { MUSCLE_LABELS } from '../../utils/exercises';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import { useSettings } from '../../context/SettingsContext';

interface Props {
  muscles: TargetedMuscle[];
  color: string;
}

export default function MuscleDiagram({ muscles, color }: Props) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const primary = muscles.filter((m) => m.isPrimary).map((m) => m.group);
  const secondary = muscles.filter((m) => !m.isPrimary).map((m) => m.group);

  if (muscles.length === 0) return null;

  return (
    <View style={styles.container}>
      {primary.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PRIMARY</Text>
          <View style={styles.chips}>
            {primary.map((g) => (
              <MuscleChip key={g} group={g} color={color} isPrimary />
            ))}
          </View>
        </View>
      )}
      {secondary.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SECONDARY</Text>
          <View style={styles.chips}>
            {secondary.map((g) => (
              <MuscleChip key={g} group={g} color={color} isPrimary={false} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function MuscleChip({
  group,
  color,
  isPrimary,
}: {
  group: MuscleGroup;
  color: string;
  isPrimary: boolean;
}) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: isPrimary ? `${color}28` : 'transparent',
          borderColor: isPrimary ? color : colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: isPrimary ? color : colors.textTertiary },
        ]}
      >
        {MUSCLE_LABELS[group]}
      </Text>
    </View>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    container: { gap: Spacing.sm },
    section: { gap: 6 },
    sectionLabel: {
      ...Typography.tiny,
      color: c.textTertiary,
      letterSpacing: 1.2,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      borderWidth: 1,
      borderRadius: Radius.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    chipText: { ...Typography.tiny, fontWeight: '600' },
  });
}
