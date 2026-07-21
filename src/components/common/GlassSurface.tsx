// GlassSurface — a cross-platform liquid-glass surface.
//
// Rendering strategy:
//  * iOS 26+ (native Liquid Glass linked): the real @callstack/liquid-glass
//    effect, which uses Apple's UIVisualEffectView material.
//  * iOS <26 / Android: expo-blur BlurView with a translucent tint — a frosted
//    look that approximates glass without the iOS 26 APIs.
//  * Web: a translucent surface (rgba tint + hairline border). BlurView has no
//    effect on web, so we skip it and rely on translucency alone.
//
// IMPORTANT: @callstack/liquid-glass's iOS entry imports a TurboModule via
// `TurboModuleRegistry.getEnforcing`, which THROWS if the native module is not
// linked. On Expo SDK 51 / old arch / Expo Go the module is absent, so we must
// never import the library eagerly. We resolve the native component lazily and
// only after confirming support — the require() is wrapped so a failure (e.g.
// in Metro web where the .ios entry is never picked) is contained.

import React from 'react';
import { Platform, View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSettings } from '../../context/SettingsContext';
import { Colors, Radius } from '../../theme';

// Lazily-resolved native glass component. Resolved once on iOS, never on web.
// Wrapped in try/catch because the enforcing TurboModule throws if unlinked.
let NativeLiquidGlass: React.ComponentType<any> | null = null;
let nativeGlassResolved = false;
function resolveNativeGlass(): React.ComponentType<any> | null {
  if (nativeGlassResolved) return NativeLiquidGlass;
  nativeGlassResolved = true;
  if (Platform.OS !== 'ios') return null;
  try {
    // Lazy require — keeps the enforcing native import off the web bundle and
    // out of platforms where it isn't linked.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@callstack/liquid-glass');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isLiquidGlassSupported } = require('@callstack/liquid-glass');
    if (isLiquidGlassSupported && mod?.LiquidGlassView) {
      NativeLiquidGlass = mod.LiquidGlassView;
    }
  } catch {
    NativeLiquidGlass = null;
  }
  return NativeLiquidGlass;
}

export interface GlassSurfaceProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Border radius (defaults to Radius.lg). */
  radius?: number;
  /** Whether this is an interactive surface (grows/shimmers on touch on iOS 26). */
  interactive?: boolean;
  /**
   * Fallback tint strength — 'regular' (default) or 'strong'. Only affects the
   * BlurView/translucent fallback, not the native iOS 26 material.
   */
  intensity?: 'regular' | 'strong';
  /**
   * Custom fallback tint color. Defaults to the theme's glassTint token, which
   * is already platform/theme aware.
   */
  fallbackTint?: string;
}

export default function GlassSurface({
  children,
  style,
  radius = Radius.lg,
  interactive = false,
  intensity = 'regular',
  fallbackTint,
}: GlassSurfaceProps) {
  const { colors } = useSettings();

  // ── Native iOS 26 Liquid Glass ────────────────────────────────────────────
  const LiquidGlassView = resolveNativeGlass();
  if (LiquidGlassView) {
    return (
      <LiquidGlassView
        interactive={interactive}
        effect="regular"
        colorScheme="system"
        // The native material ignores our tint for the most part (it samples the
        // backdrop), but a subtle tint keeps it on-brand in mixed backdrops.
        tintColor={interactive ? colors.glassTintInteractive : 'transparent'}
        style={[{ borderRadius: radius, overflow: 'hidden' }, style] as any}
      >
        {children}
      </LiquidGlassView>
    );
  }

  // ── Blur fallback (iOS <26, Android, web) ─────────────────────────────────
  // expo-blur ships a real web implementation that emits CSS `backdrop-filter`,
  // so web gets a genuine frosted effect too — no separate web branch needed.
  const tint = fallbackTint ?? (intensity === 'strong' ? colors.glassTintInteractive : colors.glassTint);

  return (
    <View style={[styles.shell, { borderRadius: radius, borderColor: colors.glassBorder }, style]}>
      <BlurView
        intensity={colors.glassBlur}
        tint="default"
        style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
      />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: tint, borderRadius: radius }]} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
});

// Re-export the theme type for consumers that type their own styles.
export type { Colors };
