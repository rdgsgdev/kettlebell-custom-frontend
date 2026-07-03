import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WorkoutItem, BlockType } from '../../models';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import WorkoutItemRow from './WorkoutItemRow';
import { generateId } from '../../utils/helpers';
import { useSettings } from '../../context/SettingsContext';

interface Props {
  title: string;
  blockType: BlockType;
  accentColor: string;
  items: WorkoutItem[];
  showRestTime: boolean;
  onChange: (items: WorkoutItem[]) => void;
  onScrollLock?: (locked: boolean) => void;
  children?: React.ReactNode; // extra config slot (e.g. EMOM duration)
}

export default function BlockSection({
  title,
  blockType,
  accentColor,
  items,
  showRestTime,
  onChange,
  onScrollLock,
  children,
}: Props) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const [localItems, setLocalItems] = useState(items);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Keep localItems in sync when items prop changes from outside (add/delete)
  // but not while a drag is in progress
  useEffect(() => {
    if (draggingId === null) setLocalItems(items);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragStart = (id: string) => {
    setDraggingId(id);
    onScrollLock?.(true);
  };

  const handleMoveUp = (id: string) => {
    setLocalItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const handleMoveDown = (id: string) => {
    setLocalItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const handleDragEnd = (latestItems: WorkoutItem[]) => {
    setDraggingId(null);
    onChange(latestItems);
    onScrollLock?.(false);
  };

  const addItem = () => {
    const newItem: WorkoutItem = {
      id: generateId(),
      exerciseName: '',
      repMode: 'bilateral',
      reps: 10,
      sets: showRestTime ? 1 : undefined,
      weight: 0,
      restTime: showRestTime ? 60 : 0,
    };
    const updated = [...localItems, newItem];
    setLocalItems(updated);
    onChange(updated);
  };

  const updateItem = (id: string, patch: Partial<WorkoutItem>) => {
    const updated = localItems.map((item) => (item.id === id ? { ...item, ...patch } : item));
    setLocalItems(updated);
    onChange(updated);
  };

  const deleteItem = (id: string) => {
    const updated = localItems.filter((item) => item.id !== id);
    setLocalItems(updated);
    onChange(updated);
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: accentColor }]} />
        <Text style={[styles.title, { color: accentColor }]}>{title.toUpperCase()}</Text>
        <View style={styles.headerLine} />
      </View>

      {children}

      {localItems.map((item, idx) => (
        <WorkoutItemRow
          key={item.id}
          item={item}
          index={idx}
          showRestTime={showRestTime}
          accentColor={accentColor}
          onUpdate={(patch) => updateItem(item.id, patch)}
          onDelete={() => deleteItem(item.id)}
          isDragging={draggingId === item.id}
          onMoveUp={() => handleMoveUp(item.id)}
          onMoveDown={() => handleMoveDown(item.id)}
          onDragStart={() => handleDragStart(item.id)}
          onDragEnd={() => handleDragEnd(localItems)}
        />
      ))}

      <TouchableOpacity
        onPress={addItem}
        activeOpacity={0.7}
        style={[styles.addBtn, { borderColor: `${accentColor}55` }]}
      >
        <Ionicons name="add-circle-outline" size={16} color={accentColor} />
        <Text style={[styles.addBtnText, { color: accentColor }]}>Add Exercise</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
  section: {
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    ...Typography.tiny,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  headerLine: {
    flex: 1,
    height: 1,
    backgroundColor: c.border,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: Spacing.xs,
  },
  addBtnText: {
    ...Typography.captionBold,
  },
  });
}
