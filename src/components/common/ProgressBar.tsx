import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../theme';
import { useSettings } from '../../context/SettingsContext';

interface Props {
  /** 0..1 fraction of the bar that is filled. Clamped internally. */
  progress: number;
  /** When true, the fill uses the success color; otherwise the accent color. */
  done?: boolean;
  /** Track height in px. Defaults to 6. */
  height?: number;
}

/**
 * Thin progress bar (track + percentage-width fill). Follows the inline pattern
 * already used for the EMOM progress bar in ExecutionScreen, but theme-aware.
 */
export default function ProgressBar({ progress, done = false, height = 6 }: Props) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  const fillColor = done ? colors.success : colors.accent;

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.fill,
          { width: `${pct}%`, backgroundColor: fillColor, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    track: {
      width: '100%',
      backgroundColor: c.border,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
    },
  });
}
