// FrequencyHeatmap — a calendar heatmap showing how many times a workout was
// completed per day, GitHub-contributions-style. Designed for high-frequency
// routines (e.g. a pull-up circuit done 3–6×/day). Days with more sessions get
// a stronger tint.
//
// Layout: columns = weeks (oldest left → newest right), rows = days of week.
// Each cell is a rounded rect. Color intensity maps to session count.

import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import { useSettings } from '../../context/SettingsContext';

const DAY_LABELS = ['M', '', 'W', '', 'F', '', 'S'];
const WEEKS = 16; // ~4 months visible

interface Props {
  /** Map of ISO date (YYYY-MM-DD) → count of sessions that day. */
  counts: Record<string, number>;
}

/**
 * Returns the intensity tier (0–3) for a given session count. Tuned for
 * high-frequency routines: 0=none, 1=single, 2–3=moderate, 4+=max.
 */
function tier(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default function FrequencyHeatmap({ counts }: Props) {
  const { colors } = useSettings();

  // Build the grid: WEEKS columns, 7 rows (Mon→Sun). Start from the Monday of
  // (WEEKS-1) weeks ago, walk forward day by day.
  const today = new Date();
  // Align today's column to the end — find the Monday of the current week, then
  // go back WEEKS-1 Mondays.
  const todayDay = today.getDay();
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - (todayDay === 0 ? 6 : todayDay - 1));
  const gridStart = new Date(thisMonday);
  gridStart.setDate(thisMonday.getDate() - (WEEKS - 1) * 7);

  const cells: { date: string; count: number; col: number; row: number }[] = [];
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + w * 7 + d);
      const iso = toISODate(date);
      // Don't render future days (after today).
      if (date > today) continue;
      cells.push({ date: iso, count: counts[iso] || 0, col: w, row: d });
    }
  }

  // Cell geometry.
  const screenW = Dimensions.get('window').width - (Spacing.lg * 2 + Spacing.md * 2);
  const labelW = 16;
  const gap = 3;
  const cellSize = Math.floor((screenW - labelW - gap * WEEKS) / WEEKS);
  const chartW = labelW + WEEKS * (cellSize + gap);
  const chartH = 7 * (cellSize + gap) + 4;
  const offsetX = labelW;

  const tierColors = [
    colors.surface,         // 0 — empty
    `${colors.accent}55`,   // 1 — single session (muted)
    `${colors.accent}99`,   // 2–3 — moderate
    colors.accent,          // 4+ — max intensity
  ];

  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Svg width={chartW} height={chartH}>
        {/* Day-of-week labels (Mon, Wed, Fri) */}
        {[0, 2, 4].map((row) => (
          <SvgText
            key={`label-${row}`}
            x={0}
            y={row * (cellSize + gap) + cellSize - 1}
            fontSize={8}
            fill={colors.textTertiary}
          >
            {DAY_LABELS[row]}
          </SvgText>
        ))}

        {/* Heatmap cells */}
        {cells.map((cell) => {
          const t = tier(cell.count);
          return (
            <Rect
              key={cell.date}
              x={offsetX + cell.col * (cellSize + gap)}
              y={cell.row * (cellSize + gap)}
              width={cellSize}
              height={cellSize}
              rx={2}
              fill={tierColors[t]}
              stroke={t === 0 ? colors.border : 'none'}
              strokeWidth={t === 0 ? 0.5 : 0}
            />
          );
        })}
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: colors.textTertiary }]}>Less</Text>
        {tierColors.map((c, i) => (
          <View key={i} style={[styles.legendCell, { backgroundColor: c, borderColor: colors.border }]} />
        ))}
        <Text style={[styles.legendText, { color: colors.textTertiary }]}>More</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: Spacing.xs,
    alignSelf: 'flex-end',
  },
  legendCell: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 0.5,
  },
  legendText: {
    ...Typography.tiny,
    marginHorizontal: 2,
  },
});
