// shims/liquid-glass-stub.ts
//
// Safe fallback for @callstack/liquid-glass on builds that do NOT run React
// Native's Codegen (Expo SDK 51 / old architecture / Expo Go / web / Android).
//
// The real library ships a Codegen spec (LiquidGlassViewNativeComponent.ts)
// that Metro cannot parse without the New Architecture — it throws
// "Unknown prop type for effect: undefined". On those builds we intercept the
// package import via metro.config.js resolveRequest and substitute this stub,
// which renders plain Views and reports the effect as unsupported.
//
// Once you upgrade to the New Architecture (Expo SDK 54+) and link the native
// module, remove the resolveRequest override in metro.config.js — the real
// library will load and GlassSurface will use the native effect automatically.

import React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

export const isLiquidGlassSupported = false;

// Accept any props (interactive, effect, tintColor, ...) and ignore them —
// matches the library's own non-iOS fallback (`export const LiquidGlassView = View`).
export const LiquidGlassView = View as React.ComponentType<ViewProps & {
  interactive?: boolean;
  effect?: 'clear' | 'regular' | 'none';
  animated?: boolean;
  animationDuration?: number;
  tintColor?: string;
  colorScheme?: 'light' | 'dark' | 'system';
}>;

export const LiquidGlassContainerView = View as React.ComponentType<ViewProps>;
