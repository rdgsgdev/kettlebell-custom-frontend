// Utility helpers

export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Compact H:MM:SS countdown that ALWAYS shows seconds, so a ticking timer
 * visibly updates every second (unlike formatDuration, which collapses to
 * "1h 59m" for a full minute when hours > 0 and looks frozen).
 * Examples: 7199 → "1:59:59", 305 → "5:05", 9 → "0:09".
 */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatShortDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatTimeOfDay(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

// ── Block display helpers ──────────────────────────────────────────────────────
import { BlockType, WorkoutBlock, ItemLog, WorkoutItem, ExecutionType } from '../models';
import { Colors } from '../theme';

/**
 * Derives an item's execution type, for backward compatibility with templates
 * created before `executionType` existed (which only carry `durationSeconds`).
 *  - explicit executionType wins
 *  - otherwise durationSeconds > 0 → 'countdown'
 *  - otherwise 'reps'
 */
export function getExecutionType(item: { executionType?: ExecutionType; durationSeconds?: number }): ExecutionType {
  if (item.executionType) return item.executionType;
  return (item.durationSeconds ?? 0) > 0 ? 'countdown' : 'reps';
}

/**
 * Returns the `[start, end]` index range (inclusive) of the superset group that
 * contains `idx`. A group is a maximal run of consecutive items where each item
 * except the last has `supersetWithNext === true`. A standalone item (no links
 * touching it) is its own size-1 group, so `[idx, idx]` is returned.
 *
 * Used by both the workout editor and the execution engine so they agree on
 * where a superset group starts and ends.
 */
export function supersetGroupRange(items: WorkoutItem[], idx: number): [number, number] {
  let start = idx;
  while (start > 0 && items[start - 1].supersetWithNext) start--;
  let end = idx;
  while (end < items.length - 1 && items[end].supersetWithNext) end++;
  return [start, end];
}

/** True if any item in the block is part of a multi-exercise superset group. */
export function blockHasSuperset(items: WorkoutItem[]): boolean {
  return items.some((it) => it.supersetWithNext);
}

export function blockColor(type: BlockType): string {
  switch (type) {
    case 'starter': return Colors.starterColor;
    case 'emom': return Colors.emomColor;
    case 'finisher': return Colors.finisherColor;
    case 'mobility': return Colors.mobilityColor;
    case 'stretching': return Colors.stretchingColor;
    case 'juarez': return Colors.mobilityColor; // teal — distinct from accent orange
  }
}

export function blockDim(type: BlockType): string {
  switch (type) {
    case 'starter': return Colors.starterDim;
    case 'emom': return Colors.emomDim;
    case 'finisher': return Colors.finisherDim;
    case 'mobility': return Colors.mobilityDim;
    case 'stretching': return Colors.stretchingDim;
    case 'juarez': return Colors.mobilityDim;
  }
}

export function blockLabel(type: BlockType): string {
  switch (type) {
    case 'starter': return 'Warm-up';
    case 'emom': return 'EMOM';
    case 'finisher': return 'Finisher';
    case 'mobility': return 'Mobility';
    case 'stretching': return 'Stretching';
    case 'juarez': return 'Juarez Valley';
  }
}

/**
 * Computes the rep count for a given Juarez Valley round.
 *
 * The sequence interleaves a descending count with an ascending count:
 * for startingReps=20: 20, 1, 19, 2, 18, 3, ..., 11, 10 (20 rounds total).
 *
 * - Even round index (0, 2, 4...) → high (descending): startingReps - round/2
 * - Odd round index (1, 3, 5...) → low (ascending): (round+1)/2
 */
export function juarezRepsForRound(round: number, startingReps: number): number {
  if (round % 2 === 0) {
    return startingReps - Math.floor(round / 2);
  }
  return Math.floor(round / 2) + 1;
}

/** Total number of rounds for a Juarez Valley block = startingReps. */
export function juarezTotalRounds(startingReps: number): number {
  return startingReps;
}

/** Returns the display colour respecting custom block overrides. */
export function getBlockDisplayColor(block: WorkoutBlock): string {
  return block.customColor ?? blockColor(block.type);
}

/** Returns the display dim colour respecting custom block overrides. */
export function getBlockDisplayDim(block: WorkoutBlock): string {
  if (block.customColor) return `${block.customColor}25`;
  return blockDim(block.type);
}

/** Returns the display label respecting custom block overrides. */
export function getBlockDisplayLabel(block: WorkoutBlock): string {
  return block.customLabel ?? blockLabel(block.type);
}

/**
 * Groups an ItemLog list by the block it came from, preserving original order
 * of first appearance. Items logged before the custom-block fields existed
 * (no blockId / customLabel) fall back to grouping by their coarse BlockType,
 * which keeps history consistent with how they were originally logged.
 */
export function groupItemLogsByBlock(items: ItemLog[]): ItemLog[][] {
  const groups: ItemLog[][] = [];
  const keyOf = (item: ItemLog) => item.blockId ?? `type:${item.blockType}`;
  const keyToGroup = new Map<string, ItemLog[]>();
  items.forEach((item) => {
    const key = keyOf(item);
    let group = keyToGroup.get(key);
    if (!group) {
      group = [];
      keyToGroup.set(key, group);
      groups.push(group);
    }
    group.push(item);
  });
  return groups;
}

/** Returns the display colour for a group of item logs (custom override wins). */
export function getItemLogGroupColor(items: ItemLog[]): string {
  const head = items[0];
  return head.customColor ?? blockColor(head.blockType);
}

/** Returns the display dim colour for a group of item logs (custom override wins). */
export function getItemLogGroupDim(items: ItemLog[]): string {
  const head = items[0];
  return head.customColor ? `${head.customColor}25` : blockDim(head.blockType);
}

/** Returns the display label for a group of item logs (custom override wins). */
export function getItemLogGroupLabel(items: ItemLog[]): string {
  const head = items[0];
  return head.customLabel ?? blockLabel(head.blockType);
}
