import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography } from '../../theme';
import { useSettings } from '../../context/SettingsContext';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}

export default function EmptyState({ icon = 'file-tray-outline', title, subtitle }: Props) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color={colors.textTertiary} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xxl,
      paddingHorizontal: Spacing.xl,
    },
    icon: {
      marginBottom: Spacing.md,
      opacity: 0.6,
    },
    title: {
      ...Typography.h3,
      color: c.textSecondary,
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    subtitle: {
      ...Typography.body,
      color: c.textTertiary,
      textAlign: 'center',
      lineHeight: 22,
    },
  });
}
