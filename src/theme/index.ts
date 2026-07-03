// Design tokens for KBC – dark premium fitness theme

export const DarkColors = {
  background: '#0D0D0F',
  surface: '#1A1A1F',
  surfaceElevated: '#242429',
  border: '#2A2A32',

  accent: '#FF6B35',
  accentDim: 'rgba(255, 107, 53, 0.15)',
  accentBright: '#FF8555',

  success: '#4ADE80',
  successDim: 'rgba(74, 222, 128, 0.15)',
  warning: '#FBBF24',
  warningDim: 'rgba(251, 191, 36, 0.15)',
  danger: '#F87171',
  dangerDim: 'rgba(248, 113, 113, 0.12)',

  textPrimary: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textTertiary: '#4B5563',

  starterColor: '#60A5FA',
  starterDim: 'rgba(96, 165, 250, 0.15)',
  emomColor: '#FF6B35',
  emomDim: 'rgba(255, 107, 53, 0.15)',
  finisherColor: '#A78BFA',
  finisherDim: 'rgba(167, 139, 250, 0.15)',
  mobilityColor: '#2DD4BF',
  mobilityDim: 'rgba(45, 212, 191, 0.15)',
  stretchingColor: '#F472B6',
  stretchingDim: 'rgba(244, 114, 182, 0.15)',
} as const;

export const LightColors = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceElevated: '#F8F8FB',
  border: '#E2E2EA',

  accent: '#FF6B35',
  accentDim: 'rgba(255, 107, 53, 0.12)',
  accentBright: '#FF8555',

  success: '#22C55E',
  successDim: 'rgba(34, 197, 94, 0.12)',
  warning: '#F59E0B',
  warningDim: 'rgba(245, 158, 11, 0.12)',
  danger: '#EF4444',
  dangerDim: 'rgba(239, 68, 68, 0.10)',

  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textTertiary: '#9CA3AF',

  starterColor: '#3B82F6',
  starterDim: 'rgba(59, 130, 246, 0.12)',
  emomColor: '#FF6B35',
  emomDim: 'rgba(255, 107, 53, 0.12)',
  finisherColor: '#8B5CF6',
  finisherDim: 'rgba(139, 92, 246, 0.12)',
  mobilityColor: '#14B8A6',
  mobilityDim: 'rgba(20, 184, 166, 0.12)',
  stretchingColor: '#EC4899',
  stretchingDim: 'rgba(236, 72, 153, 0.12)',
} as const;

// Backwards-compatible alias — existing screens keep using `Colors` (dark)
export const Colors = DarkColors;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const Typography = {
  hero: { fontSize: 56, fontWeight: '800' as const, letterSpacing: -2 },
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyBold: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  captionBold: { fontSize: 13, fontWeight: '600' as const },
  tiny: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.5 },
} as const;
