import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing } from '../../theme';
import { useSettings } from '../../context/SettingsContext';
import GlassSurface from './GlassSurface';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  elevated?: boolean;
  /**
   * Render as a normal opaque surface instead of glass. Use for cards that sit
   * on an already-glassy backdrop (e.g. inside a glass tab bar or modal) where
   * stacking two translucent layers would look muddy.
   */
  opaque?: boolean;
}

export default function Card({ children, style, padded = true, elevated = false, opaque = false }: Props) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);

  // Opaque path keeps the original solid surface (pre-glass Card look) for
  // callers that explicitly opt out, and for nested-glass situations.
  if (opaque) {
    return (
      <GlassSurface
        fallbackTint={elevated ? colors.surfaceElevated : colors.surface}
        radius={16}
        style={[elevated && styles.elevated, padded && styles.padded, style]}
      >
        {children}
      </GlassSurface>
    );
  }

  return (
    <GlassSurface
      interactive={false}
      intensity={elevated ? 'strong' : 'regular'}
      radius={16}
      style={[elevated && styles.elevated, padded && styles.padded, style]}
    >
      {children}
    </GlassSurface>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    elevated: {
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
