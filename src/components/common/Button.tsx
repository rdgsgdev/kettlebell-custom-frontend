import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../theme';
import { useSettings } from '../../context/SettingsContext';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

function makeVariantStyles(c: typeof Colors): Record<Variant, { bg: string; text: string; border?: string }> {
  return {
    primary: { bg: c.accent, text: c.textPrimary },
    secondary: { bg: c.surface, text: c.accent, border: c.border },
    ghost: { bg: 'transparent', text: c.textSecondary },
    danger: { bg: c.dangerDim, text: c.danger, border: c.danger },
  };
}

const sizeStyles: Record<Size, { paddingV: number; paddingH: number; fontSize: number }> = {
  sm: { paddingV: 8, paddingH: 14, fontSize: 13 },
  md: { paddingV: 13, paddingH: 20, fontSize: 15 },
  lg: { paddingV: 18, paddingH: 28, fontSize: 17 },
};

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
}: Props) {
  const { colors } = useSettings();
  const variantStyles = makeVariantStyles(colors);
  const vs = variantStyles[variant];
  const ss = sizeStyles[size];
  const opacity = disabled || loading ? 0.5 : 1;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      style={[
        styles.base,
        {
          backgroundColor: vs.bg,
          paddingVertical: ss.paddingV,
          paddingHorizontal: ss.paddingH,
          borderWidth: vs.border ? 1 : 0,
          borderColor: vs.border ?? 'transparent',
          opacity,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={vs.text} size="small" />
      ) : (
        <>
          {icon}
          <Text
            style={[styles.label, { color: vs.text, fontSize: ss.fontSize }, textStyle]}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  label: {
    fontWeight: '600',
  },
});
