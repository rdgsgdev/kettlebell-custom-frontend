import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '../../theme';
import { useSettings } from '../../context/SettingsContext';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  elevated?: boolean;
}

export default function Card({ children, style, padded = true, elevated = false }: Props) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  return (
    <View
      style={[
        styles.card,
        elevated && styles.elevated,
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    elevated: {
      backgroundColor: c.surfaceElevated,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 6,
    },
    padded: {
      padding: Spacing.md,
    },
  });
}
