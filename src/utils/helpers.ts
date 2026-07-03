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
import { BlockType, WorkoutBlock, ItemLog } from '../models';
import { Colors } from '../theme';

export function blockColor(type: BlockType): string {
  switch (type) {
    case 'starter': return Colors.starterColor;
    case 'emom': return Colors.emomColor;
    case 'finisher': return Colors.finisherColor;
    case 'mobility': return Colors.mobilityColor;
    case 'stretching': return Colors.stretchingColor;
  }
}

export function blockDim(type: BlockType): string {
  switch (type) {
    case 'starter': return Colors.starterDim;
    case 'emom': return Colors.emomDim;
    case 'finisher': return Colors.finisherDim;
    case 'mobility': return Colors.mobilityDim;
    case 'stretching': return Colors.stretchingDim;
  }
}

export function blockLabel(type: BlockType): string {
  switch (type) {
    case 'starter': return 'Warm-up';
    case 'emom': return 'EMOM';
    case 'finisher': return 'Finisher';
    case 'mobility': return 'Mobility';
    case 'stretching': return 'Stretching';
  }
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
