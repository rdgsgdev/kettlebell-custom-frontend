import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Line, Rect, Text as SvgText } from 'react-native-svg';
import { useAppContext } from '../context/AppContext';
import { WorkoutLog, Exercise, MuscleGroup } from '../models';
import { Colors, Spacing, Typography, Radius } from '../theme';
import { MUSCLE_LABELS } from '../utils/exercises';
import { useSettings } from '../context/SettingsContext';
import CalendarStrip from '../components/history/CalendarStrip';
import LogCard from '../components/history/LogCard';
import EmptyState from '../components/common/EmptyState';
import { isSameDay } from '../utils/helpers';

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatVolume(v: number): string {
  if (v === 0) return '—';
  return `${Math.round(v)}`;
}

function formatTotalDuration(totalSeconds: number): string {
  if (totalSeconds === 0) return '—';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function getMondayISO(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

function logVolume(log: WorkoutLog): number {
  return log.itemLogs
    .filter((i) => i.completed && i.weight > 0)
    .reduce((sum, i) => sum + i.weight, 0);
}

/**
 * Rep count for a single item log, respecting rep mode. Bilateral sets use
 * `reps` directly; unilateral sets (L/R or F/R) sum the two sides — this fixes
 * the undercount in the previous chart, which read only `reps` and ignored the
 * split fields, roughly halving every swing/clean/press set.
 */
function itemReps(i: { reps: number; repsLeft?: number; repsRight?: number; repMode: string }): number {
  if (i.repMode !== 'bilateral' && i.repsLeft != null) {
    const left = i.repsLeft || 0;
    const right = i.repsRight ?? i.repsLeft ?? 0;
    return left + right;
  }
  return i.reps;
}

/** Weighted tonnage (reps × kg) for one log, weighted + completed + non-skipped only. */
function logTonnage(log: WorkoutLog): number {
  return log.itemLogs
    .filter((i) => i.completed && !i.skipped && i.weight > 0)
    .reduce((sum, i) => sum + itemReps(i) * i.weight, 0);
}

export type TonnageTrend = 'progressing' | 'stagnating' | 'regressing' | 'insufficient';

export interface WeeklyTonnage {
  labels: string[];
  /** Total weighted tonnage per week (kg). 0 = no weighted work that week. */
  values: number[];
  /** Per-week flag: true if the week is part of a ≥3-week stagnating plateau. */
  plateau: boolean[];
  /** Smoothed (3-week moving average) trend over the values, for the overlay line. */
  smoothed: number[];
  trend: TonnageTrend;
  /** Trend magnitude: % per week slope, or count of flat weeks for stagnation. */
  trendPct: number;
}

const TONNAGE_WEEKS = 12;
const PLATEAU_THRESHOLD_WEEKS = 3; // flat-or-declining run that counts as a plateau
const TREND_WINDOW = 8; // trailing weeks used to compute the trend slope

/**
 * Buckets workout logs into the last `TONNAGE_WEEKS` ISO weeks and sums the
 * weighted tonnage per week. Weighted-only (weight = 0 sets contribute nothing
 * and are excluded) — this is the progressive-overload signal. Bodyweight work
 * is intentionally not part of this metric.
 *
 * Trend is the linear-regression slope of the trailing TREND_WINDOW weeks,
 * expressed as % change per week relative to the window mean. A run of ≥3
 * consecutive flat-or-declining active weeks is flagged as a plateau.
 */
function getWeeklyTonnage(logs: WorkoutLog[]): WeeklyTonnage {
  const today = new Date();
  const weeks: Array<{ start: string; label: string }> = [];
  for (let i = TONNAGE_WEEKS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i * 7);
    weeks.push({ start: getMondayISO(d), label: shortWeekLabel(d) });
  }

  // Sum tonnage per week.
  const totals: Record<string, number> = {};
  weeks.forEach((w) => { totals[w.start] = 0; });
  logs.forEach((log) => {
    const ws = getMondayISO(new Date(log.startedAt));
    if (totals[ws] !== undefined) totals[ws] += logTonnage(log);
  });

  const values = weeks.map((w) => Math.round(totals[w.start]));

  // 3-week centered moving average for the trend overlay. Pads with the edge
  // value so endpoints don't sag. Skipped (zero) weeks still feed the average
  // — a real plateau is a flat line *including* the dips.
  const smoothed = values.map((_, i) => {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(values.length - 1, i + 1);
    const slice = values.slice(lo, hi + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });

  // Plateau detection: a run of ≥3 consecutive weeks that are flat-or-declining
  // relative to the previous active week. Only "active" weeks (tonnage > 0)
  // extend a run; a zero week breaks it (that's a missed week, not a plateau).
  const plateau = new Array(values.length).fill(false);
  let runStart = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === 0) { runStart = -1; continue; }
    if (runStart === -1) { runStart = i; continue; }
    if (values[i] <= values[i - 1]) {
      // flat or down vs previous — extend the run
      if (i - runStart + 1 >= PLATEAU_THRESHOLD_WEEKS) {
        for (let j = runStart; j <= i; j++) if (values[j] > 0) plateau[j] = true;
      }
    } else {
      runStart = i;
    }
  }

  // Trend: least-squares slope over the trailing TREND_WINDOW weeks, as % of
  // the window mean. Needs ≥2 active weeks to be meaningful.
  const winStart = Math.max(0, values.length - TREND_WINDOW);
  const winIdx = [];
  const winVal = [];
  for (let i = winStart; i < values.length; i++) {
    if (values[i] > 0) { winIdx.push(i - winStart); winVal.push(values[i]); }
  }

  let trend: TonnageTrend = 'insufficient';
  let trendPct = 0;
  if (winVal.length >= 2) {
    const n = winVal.length;
    const meanX = winIdx.reduce((s, v) => s + v, 0) / n;
    const meanY = winVal.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let k = 0; k < n; k++) {
      num += (winIdx[k] - meanX) * (winVal[k] - meanY);
      den += (winIdx[k] - meanX) ** 2;
    }
    const slopePerWeek = den > 0 ? num / den : 0; // kg per week
    trendPct = meanY > 0 ? (slopePerWeek / meanY) * 100 : 0; // % per week

    // Count consecutive flat/declining weeks at the tail for the stagnation label.
    let flatTail = 0;
    for (let i = values.length - 1; i > 0; i--) {
      if (values[i] > 0 && values[i] <= values[i - 1]) flatTail++;
      else break;
    }

    if (trendPct >= 3) trend = 'progressing';
    else if (trendPct <= -3) trend = 'regressing';
    else trend = 'stagnating';

    // For stagnation, report the flat-week count instead of a tiny %.
    if (trend === 'stagnating') trendPct = Math.max(flatTail, PLATEAU_THRESHOLD_WEEKS);
  }

  return {
    labels: weeks.map((w) => w.label),
    values,
    plateau,
    smoothed,
    trend,
    trendPct,
  };
}

function shortWeekLabel(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function getMuscleCounts(
  logs: WorkoutLog[],
  exercises: Exercise[],
): Array<[MuscleGroup, number]> {
  const exMap = new Map(exercises.map((e) => [e.name, e]));
  const counts: Partial<Record<MuscleGroup, number>> = {};
  logs.forEach((log) => {
    const seen = new Set<string>();
    log.itemLogs.filter((i) => i.completed).forEach((i) => {
      const key = `${log.id}::${i.exerciseName}`;
      if (seen.has(key)) return;
      seen.add(key);
      const ex = exMap.get(i.exerciseName);
      if (ex) {
        ex.muscles.forEach((m) => {
          counts[m.group] = (counts[m.group] || 0) + (m.isPrimary ? 2 : 1);
        });
      }
    });
  });
  return (Object.entries(counts) as [MuscleGroup, number][]).sort((a, b) => b[1] - a[1]);
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

const CHART_INSET = Spacing.lg * 2 + Spacing.md * 2;

/**
 * Weekly tonnage chart: bars (absolute kg per week) + a smoothed trend line
 * across the bar tops. Bars in a ≥3-week plateau are tinted warning (amber) so
 * stagnation reads at a glance. Zero-volume weeks render as a faint baseline
 * tick (not a zero-height bar) so missed weeks stay visible.
 */
function TonnageChart({
  labels,
  values,
  smoothed,
  plateau,
}: {
  labels: string[];
  values: number[];
  smoothed: number[];
  plateau: boolean[];
}) {
  const { colors } = useSettings();
  const W = Dimensions.get('window').width - CHART_INSET;
  const H = 130;
  const bottomPad = 20;
  const topPad = 14;
  const chartH = H - bottomPad - topPad;
  const n = values.length;
  const maxVal = Math.max(...values, ...smoothed, 1);

  // Bar geometry: each week gets a slot; the bar fills ~60% of the slot width.
  const slotW = W / n;
  const barW = slotW * 0.6;
  const barGap = (slotW - barW) / 2;

  const barX = (i: number) => i * slotW + barGap;
  const yForVal = (v: number) => topPad + chartH - (v / maxVal) * chartH;

  // Trend line points: centered over each bar's slot.
  const linePts = smoothed.map((v, i) => ({ x: i * slotW + slotW / 2, y: yForVal(v) }));
  const linePath = linePts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
    .join(' ');

  return (
    <Svg width={W} height={H}>
      {/* Baseline */}
      <Line x1={0} y1={H - bottomPad} x2={W} y2={H - bottomPad}
        stroke={colors.border} strokeWidth={1} />

      {/* Bars */}
      {values.map((v, i) => {
        if (v === 0) {
          // Missed week: a faint baseline tick so gaps stay visible.
          return (
            <Rect
              key={`tick-${i}`}
              x={barX(i) + barW / 2 - 1}
              y={H - bottomPad - 2}
              width={2}
              height={2}
              fill={colors.textTertiary}
              opacity={0.5}
            />
          );
        }
        const h = (v / maxVal) * chartH;
        const fill = plateau[i] ? colors.warning : colors.accent;
        return (
          <Rect
            key={`bar-${i}`}
            x={barX(i)}
            y={H - bottomPad - h}
            width={barW}
            height={h}
            fill={fill}
            opacity={i === n - 1 ? 1 : 0.85}
            rx={2}
          />
        );
      })}

      {/* Smoothed trend line over the bar tops */}
      {linePts.length >= 2 && (
        <Path
          d={linePath}
          stroke={colors.textPrimary}
          strokeWidth={1.5}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.8}
        />
      )}

      {/* X-axis labels (every other week to avoid crowding) */}
      {labels.map((label, i) =>
        i % 2 === 0 || i === n - 1 ? (
          <SvgText
            key={`lbl-${i}`}
            x={i * slotW + slotW / 2}
            y={H - 6}
            textAnchor="middle"
            fontSize={8}
            fill={i === n - 1 ? colors.textSecondary : colors.textTertiary}
          >
            {label}
          </SvgText>
        ) : null,
      )}
    </Svg>
  );
}

function TrendBadge({ trend, pct }: { trend: TonnageTrend; pct: number }) {
  const { colors } = useSettings();
  if (trend === 'insufficient') return null;
  const isUp = trend === 'progressing';
  const isDown = trend === 'regressing';
  const color = isUp ? colors.success : isDown ? colors.warning : colors.textTertiary;
  const icon = isUp ? 'trending-up' : isDown ? 'trending-down' : 'remove';
  const label =
    trend === 'progressing' ? 'Progressing'
      : trend === 'regressing' ? 'Regressing'
        : 'Stagnating';
  // For stagnation, pct is the count of flat weeks (not a percentage). For the
  // other two, pct is the weekly % change.
  const suffix =
    trend === 'stagnating'
      ? pct > 0 ? ` · ${Math.round(pct)} wks` : ''
      : Math.abs(Math.round(pct)) > 0 ? ` · ${Math.abs(Math.round(pct))}%` : '';
  return (
    <View style={[trendStyles.badge, { backgroundColor: `${color}1A` }]}>
      <Ionicons name={icon as any} size={12} color={color} />
      <Text style={[trendStyles.text, { color }]}>
        {label}{suffix}
      </Text>
    </View>
  );
}

const trendStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  text: { ...Typography.tiny, fontWeight: '700' },
});

function DonutChart({ total, partial }: { total: number; partial: number }) {
  const { colors } = useSettings();
  const donutStyles = makeDonutStyles(colors);
  const completed = total - partial;
  const ratio = total > 0 ? completed / total : 1;
  const R = 34;
  const cx = 48;
  const cy = 48;
  const SIZE = 96;
  const circumference = 2 * Math.PI * R;
  const dashOffset = circumference * (1 - ratio);
  const pct = Math.round(ratio * 100);

  return (
    <View style={donutStyles.container}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={cx} cy={cy} r={R} fill="none" stroke={colors.border} strokeWidth={9} />
        <Circle
          cx={cx} cy={cy} r={R}
          fill="none"
          stroke={colors.accent}
          strokeWidth={9}
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${cx}, ${cy}`}
        />
        <SvgText x={cx} y={cy - 5} textAnchor="middle" fontSize={18} fontWeight="700"
          fill={colors.textPrimary}>
          {pct}%
        </SvgText>
        <SvgText x={cx} y={cy + 11} textAnchor="middle" fontSize={9}
          fill={colors.textTertiary}>
          done
        </SvgText>
      </Svg>
      <View style={donutStyles.legend}>
        <View style={donutStyles.legendRow}>
          <View style={[donutStyles.dot, { backgroundColor: colors.accent }]} />
          <Text style={donutStyles.legendText}>{completed} complete</Text>
        </View>
        {partial > 0 && (
          <View style={donutStyles.legendRow}>
            <View style={[donutStyles.dot, { backgroundColor: colors.warning }]} />
            <Text style={donutStyles.legendText}>{partial} partial</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function makeDonutStyles(c: typeof Colors) {
  return StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
    legend: { gap: Spacing.sm },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    dot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { ...Typography.caption, color: c.textSecondary },
  });
}

function MuscleHeatmap({ entries }: { entries: Array<[MuscleGroup, number]> }) {
  const { colors } = useSettings();
  if (entries.length === 0) return null;
  const maxCount = entries[0][1];
  return (
    <View style={heatStyles.grid}>
      {entries.map(([group, count]) => {
        const intensity = count / maxCount;
        const alpha = Math.round(32 + intensity * 176).toString(16).padStart(2, '0');
        return (
          <View
            key={group}
            style={[
              heatStyles.chip,
              { backgroundColor: `${colors.accent}${alpha}`, borderColor: `${colors.accent}60` },
            ]}
          >
            <Text
              style={[
                heatStyles.chipText,
                { color: intensity > 0.5 ? colors.accent : colors.textSecondary },
              ]}
            >
              {MUSCLE_LABELS[group]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const heatStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
  },
  chipText: { ...Typography.tiny, fontWeight: '600' },
});

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ value, label, icon }: { value: string; label: string; icon: string }) {
  const { colors } = useSettings();
  const statStyles = makeStatStyles(colors);
  return (
    <View style={[statStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name={icon as any} size={16} color={colors.accent} />
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}
function makeStatStyles(c: typeof Colors) {
  return StyleSheet.create({
    card: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: Radius.lg,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.sm,
      gap: 4,
      borderWidth: 1,
      borderColor: c.border,
    },
    value: { ...Typography.h2, color: c.textPrimary },
    label: { ...Typography.tiny, color: c.textTertiary, textAlign: 'center' },
  });
}

export default function HistoryScreen() {
  const { logs, deleteLog, updateLog, exercises } = useAppContext();
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [muscleFilter, setMuscleFilter] = useState<'week' | 'month'>('month');

  const workoutDates = logs.map((l) => l.startedAt);
  const filteredLogs = selectedDate
    ? logs.filter((l) => isSameDay(l.startedAt, selectedDate))
    : logs;

  const handleDelete = (id: string) => deleteLog(id);
  const handleUpdate = (log: WorkoutLog) => updateLog(log);
  const handleSelectDate = (date: string) =>
    setSelectedDate((prev) => (prev && isSameDay(prev, date) ? null : date));

  const partialCount = logs.filter((l) => l.isPartial).length;

  const avgDurationStr = useMemo(() => {
    if (logs.length === 0) return '—';
    const distinctDays = new Set(logs.map((l) => l.startedAt.split('T')[0])).size;
    const totalSec = logs.reduce((s, l) => s + l.totalDurationSeconds, 0);
    const m = Math.round(totalSec / distinctDays / 60);
    if (m === 0) return '—';
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ''}`;
  }, [logs]);

  const totalVol = useMemo(() => logs.reduce((s, l) => s + logVolume(l), 0), [logs]);
  const totalDurStr = useMemo(
    () => formatTotalDuration(logs.reduce((s, l) => s + l.totalDurationSeconds, 0)),
    [logs],
  );

  const weeklyTonnage = useMemo(() => getWeeklyTonnage(logs), [logs]);

  const muscleFilteredLogs = useMemo(() => {
    const cutoff = muscleFilter === 'week'
      ? Date.now() - 7 * 86400000
      : Date.now() - 30 * 86400000;
    return logs.filter((l) => new Date(l.startedAt).getTime() >= cutoff);
  }, [logs, muscleFilter]);

  const muscleCounts = useMemo(
    () => getMuscleCounts(muscleFilteredLogs, exercises),
    [muscleFilteredLogs, exercises],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header — fixed above the scrolling content */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Progress</Text>
        <View style={styles.headerStats}>
          <Text style={[styles.statText, { color: colors.textTertiary }]}>{logs.length} logged</Text>
          {partialCount > 0 && (
            <Text style={styles.partialStat}>{partialCount} partial</Text>
          )}
        </View>
      </View>

      {/* Calendar — fixed above the scrolling content */}
      <View style={styles.calendarWrapper}>
        <CalendarStrip
          workoutDates={workoutDates}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
        />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Active filter chip */}
        {selectedDate && (
          <View style={styles.filterRow}>
            <View style={styles.filterChip}>
              <Text style={styles.filterText}>
                {new Date(selectedDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedDate(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.filterClear}>✕</Text>
              </TouchableOpacity>
            </View>
            {filteredLogs.length === 0 && (
              <Text style={styles.noLogsOnDay}>No workouts on this day</Text>
            )}
          </View>
        )}

        {logs.length > 0 && (
          <>
            {/* Stats — row 1 */}
            <View style={styles.statsStrip}>
              <StatCard
                value={`${logs.length}`}
                label="Sessions"
                icon="checkmark-circle-outline"
              />
              <StatCard
                value={formatVolume(totalVol)}
                label="Total kg"
                icon="barbell-outline"
              />
            </View>

            {/* Stats — row 2 */}
            <View style={[styles.statsStrip, styles.statsStripLast]}>
              <StatCard
                value={totalDurStr}
                label="Total duration"
                icon="time-outline"
              />
              <StatCard
                value={avgDurationStr}
                label="Avg duration"
                icon="hourglass-outline"
              />
            </View>
          </>
        )}

        {/* Summary cards */}
        {logs.length > 0 && (
          <>
            {/* Weekly weighted tonnage — progressive-overload progression */}
            {weeklyTonnage.values.some((v) => v > 0) && (
              <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.chartTitleRow}>
                  <Text style={styles.chartTitle}>WEIGHTED TONNAGE · weekly</Text>
                  <TrendBadge trend={weeklyTonnage.trend} pct={weeklyTonnage.trendPct} />
                </View>
                <TonnageChart
                  labels={weeklyTonnage.labels}
                  values={weeklyTonnage.values}
                  smoothed={weeklyTonnage.smoothed}
                  plateau={weeklyTonnage.plateau}
                />
                <Text style={styles.noDataText}>
                  {weeklyTonnage.trend === 'stagnating'
                    ? `Plateau detected — add reps or weight to break it.`
                    : weeklyTonnage.trend === 'regressing'
                      ? 'Lower volume — deload or fatigue?'
                      : weeklyTonnage.trend === 'progressing'
                        ? 'Volume trending up — progressive overload working.'
                        : 'Total work moved per week (reps × kg).'}
                </Text>
              </View>
            )}

            {/* Muscle heatmap */}
            <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.chartTitleRow}>
                <Text style={styles.chartTitle}>MUSCLES TRAINED</Text>
                <View style={styles.muscleFilterRow}>
                  {(['week', 'month'] as const).map((f) => (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setMuscleFilter(f)}
                      style={[
                        styles.muscleFilterChip,
                        muscleFilter === f && styles.muscleFilterChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.muscleFilterText,
                          muscleFilter === f && styles.muscleFilterTextActive,
                        ]}
                      >
                        {f === 'week' ? 'Week' : 'Month'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {muscleCounts.length > 0 ? (
                <MuscleHeatmap entries={muscleCounts} />
              ) : (
                <Text style={styles.noDataText}>No muscle data for this period</Text>
              )}
            </View>
          </>
        )}

        {/* Log list */}
        {logs.length === 0 ? (
          <EmptyState
            icon="stats-chart-outline"
            title="No workouts logged"
            subtitle={'Complete a workout on the Execution tab\nand tap "Log Now" to record it here.'}
          />
        ) : filteredLogs.length === 0 ? null : (
          <View style={styles.logList}>
            {filteredLogs.map((log) => (
              <LogCard key={log.id} log={log} onDelete={() => handleDelete(log.id)} onUpdate={handleUpdate} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    scrollContent: { paddingBottom: 80 },

    header: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.sm,
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    title: { ...Typography.h1, color: c.textPrimary },
    headerStats: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
    statText: { ...Typography.caption, color: c.textTertiary },
    partialStat: { ...Typography.caption, color: c.warning },

    statsStrip: {
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.sm,
    },
    statsStripLast: {
      paddingBottom: Spacing.md,
    },

    chartCard: {
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.md,
      backgroundColor: c.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    chartTitle: { ...Typography.tiny, color: c.textTertiary, letterSpacing: 1.2 },
    chartTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    noDataText: {
      ...Typography.caption,
      color: c.textTertiary,
      textAlign: 'center',
      paddingVertical: Spacing.sm,
    },

    muscleFilterRow: { flexDirection: 'row', gap: 4 },
    muscleFilterChip: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: c.border,
    },
    muscleFilterChipActive: {
      backgroundColor: c.accentDim,
      borderColor: c.accent,
    },
    muscleFilterText: { ...Typography.tiny, color: c.textTertiary, fontWeight: '600' },
    muscleFilterTextActive: { color: c.accent },

    calendarWrapper: { height: 96, backgroundColor: c.background },

    filterRow: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      gap: Spacing.xs,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.accentDim,
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      gap: Spacing.sm,
      alignSelf: 'flex-start',
    },
    filterText: { ...Typography.captionBold, color: c.accent },
    filterClear: { ...Typography.caption, color: c.accent, fontWeight: '700' },
    noLogsOnDay: { ...Typography.caption, color: c.textTertiary, paddingHorizontal: Spacing.sm },

    logList: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  });
}
