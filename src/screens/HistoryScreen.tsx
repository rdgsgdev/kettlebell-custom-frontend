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
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
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
 * Builds an overall progression trend from workout history.
 *
 * Because a session combines many exercises, the raw totals (kg, reps, minutes)
 * grow whenever you simply train more or longer — that's volume, not strength
 * gains. To isolate progressive-overload signal, we measure an "intensity"
 * metric per session: average kg per completed set (weighted sets only). For
 * bodyweight/time work, average session duration and average reps per set are
 * tracked as supporting signals so the curve still moves when there's no weight
 * data yet.
 *
 * Each signal is independently normalised to its own 0–100 range (min→max
 * across the window), then a weighted blend produces a single composite curve.
 * The blend favours weight intensity when weighted sets exist, otherwise it
 * falls back to reps/duration so the graph stays meaningful for all users.
 */
function getSessionMetrics(log: WorkoutLog) {
  const weightedSets = log.itemLogs.filter((i) => i.completed && i.weight > 0);
  const allCompletedSets = log.itemLogs.filter((i) => i.completed);
  const totalReps = allCompletedSets.reduce((s, i) => s + i.reps, 0);
  const totalWeight = weightedSets.reduce((s, i) => s + i.weight, 0);
  return {
    weightIntensity: weightedSets.length ? totalWeight / weightedSets.length : 0,
    avgReps: allCompletedSets.length ? totalReps / allCompletedSets.length : 0,
    durationMin: log.totalDurationSeconds / 60,
    hasWeight: weightedSets.length > 0,
  };
}

interface OverallProgression {
  labels: string[];
  data: number[];
  trend: 'progressing' | 'stagnating' | 'regressing' | 'insufficient';
  /** Percentage change of the composite score, first half vs second half of the window. */
  trendPct: number;
  /** Human-readable description of what drove the trend. */
  trendDetail: string;
}

function normalise(values: number[]): number[] {
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length === 0) return values.map(() => 0);
  const min = Math.min(...nonZero);
  const max = Math.max(...nonZero);
  if (max - min < 1e-9) return values.map((v) => (v > 0 ? 50 : 0));
  return values.map((v) => (v > 0 ? ((v - min) / (max - min)) * 100 : 0));
}

function getOverallProgression(logs: WorkoutLog[]): OverallProgression {
  if (logs.length === 0) {
    return { labels: [], data: [], trend: 'insufficient', trendPct: 0, trendDetail: '' };
  }

  // Bucket each log into the week of its Monday, across the last 8 weeks.
  const today = new Date();
  const weeks: Array<{ start: string; label: string }> = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i * 7);
    weeks.push({ start: getMondayISO(d), label: shortWeekLabel(d) });
  }

  // Aggregate per-week averages across the sessions that fell in that week.
  const buckets: Record<
    string,
    { wIntensity: number[]; avgReps: number[]; duration: number[]; hasWeight: boolean }
  > = {};
  weeks.forEach((w) => {
    buckets[w.start] = { wIntensity: [], avgReps: [], duration: [], hasWeight: false };
  });
  logs.forEach((log) => {
    const ws = getMondayISO(new Date(log.startedAt));
    if (!buckets[ws]) return;
    const m = getSessionMetrics(log);
    buckets[ws].wIntensity.push(m.weightIntensity);
    buckets[ws].avgReps.push(m.avgReps);
    buckets[ws].duration.push(m.durationMin);
    if (m.hasWeight) buckets[ws].hasWeight = true;
  });

  const mean = (arr: number[]) =>
    arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const wIntensitySeries = weeks.map((w) => mean(buckets[w.start].wIntensity));
  const avgRepsSeries = weeks.map((w) => mean(buckets[w.start].avgReps));
  const durationSeries = weeks.map((w) => mean(buckets[w.start].duration));

  // Normalise each signal independently to 0–100.
  const wNorm = normalise(wIntensitySeries);
  const rNorm = normalise(avgRepsSeries);
  const dNorm = normalise(durationSeries);

  const anyWeight = wIntensitySeries.some((v) => v > 0);

  // Weighted blend. When weight data exists it's the strongest strength signal;
  // reps and duration add supporting signal so bodyweight/time sessions still
  // contribute.
  const composite = weeks.map((_, i) => {
    if (anyWeight) {
      return wNorm[i] * 0.6 + rNorm[i] * 0.25 + dNorm[i] * 0.15;
    }
    return rNorm[i] * 0.6 + dNorm[i] * 0.4;
  });

  // Trend: compare the average composite of the first half of active points vs
  // the second half.
  const activeIdx = composite.map((v, i) => ({ v, i })).filter((p) => p.v > 0);
  let trend: OverallProgression['trend'] = 'insufficient';
  let trendPct = 0;
  let trendDetail = '';
  if (activeIdx.length >= 2) {
    const half = Math.floor(activeIdx.length / 2);
    const firstHalf = activeIdx.slice(0, half || 1);
    const secondHalf = activeIdx.slice(half);
    const firstAvg = mean(firstHalf.map((p) => p.v));
    const secondAvg = mean(secondHalf.map((p) => p.v));
    trendPct = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;
    if (trendPct > 8) trend = 'progressing';
    else if (trendPct < -8) trend = 'regressing';
    else trend = 'stagnating';
    trendDetail = anyWeight
      ? 'Based on avg weight per set, reps & duration'
      : 'Based on avg reps per set & duration';
  }

  return {
    labels: weeks.map((w) => w.label),
    data: composite,
    trend,
    trendPct,
    trendDetail,
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

function LineChart({ labels, data, color }: { labels: string[]; data: number[]; color: string }) {
  const { colors } = useSettings();
  const W = Dimensions.get('window').width - CHART_INSET;
  const H = 110;
  const bottomPad = 18;
  const topPad = 10;
  const chartH = H - bottomPad - topPad;
  const n = data.length;
  const maxVal = Math.max(...data, 1);
  const slotW = W / (n - 1);
  const pts = data.map((val, i) => ({
    x: i * slotW,
    y: topPad + chartH - (val / maxVal) * chartH,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${pts[n - 1].x},${H - bottomPad} L${pts[0].x},${H - bottomPad} Z`;

  return (
    <Svg width={W} height={H}>
      <Line x1={0} y1={H - bottomPad} x2={W} y2={H - bottomPad}
        stroke={colors.border} strokeWidth={1} />
      <Path d={areaPath} fill={`${color}20`} />
      <Path d={linePath} stroke={color} strokeWidth={2} fill="none"
        strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <React.Fragment key={i}>
          {data[i] > 0 && (
            <Circle cx={p.x} cy={p.y} r={3}
              fill={i === n - 1 ? color : `${color}99`} />
          )}
          <SvgText x={p.x} y={H - 4} textAnchor="middle" fontSize={9}
            fill={i === n - 1 ? colors.textSecondary : colors.textTertiary}>
            {labels[i]}
          </SvgText>
        </React.Fragment>
      ))}
    </Svg>
  );
}

function TrendBadge({ trend, pct }: { trend: OverallProgression['trend']; pct: number }) {
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
  return (
    <View style={[trendStyles.badge, { backgroundColor: `${color}1A` }]}>
      <Ionicons name={icon as any} size={12} color={color} />
      <Text style={[trendStyles.text, { color }]}>
        {label}{Math.abs(Math.round(pct)) > 0 ? ` · ${Math.abs(Math.round(pct))}%` : ''}
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

  const overallProgression = useMemo(() => getOverallProgression(logs), [logs]);

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
            {/* Overall progression */}
            {overallProgression.data.some((v) => v > 0) && (
              <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.chartTitleRow}>
                  <Text style={styles.chartTitle}>PROGRESSION</Text>
                  <TrendBadge trend={overallProgression.trend} pct={overallProgression.trendPct} />
                </View>
                <LineChart
                  labels={overallProgression.labels}
                  data={overallProgression.data}
                  color={
                    overallProgression.trend === 'regressing'
                      ? colors.warning
                      : overallProgression.trend === 'progressing'
                        ? colors.success
                        : colors.accent
                  }
                />
                {overallProgression.trendDetail ? (
                  <Text style={styles.noDataText}>{overallProgression.trendDetail}</Text>
                ) : null}
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
