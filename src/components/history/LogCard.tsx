import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WorkoutLog, ItemLog } from '../../models';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import {
  groupItemLogsByBlock,
  getItemLogGroupColor,
  getItemLogGroupDim,
  getItemLogGroupLabel,
} from '../../utils/helpers';
import { formatShortDate, formatTimeOfDay, formatDuration } from '../../utils/helpers';
import SwipeableRow from '../common/SwipeableRow';
import NumericInput from '../common/NumericInput';
import { useSettings } from '../../context/SettingsContext';



interface Props {
  log: WorkoutLog;
  onDelete: () => void;
  onUpdate: (log: WorkoutLog) => void;
}

export default function LogCard({ log, onDelete, onUpdate }: Props) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const [expanded, setExpanded] = useState(false);
  // Item being edited inline (by itemLog id), null = none
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null); // null = not editing

  const completedCount = log.itemLogs.filter((l) => l.completed).length;
  const totalCount = log.itemLogs.length;

  /** Patch a single item log and persist the whole log. */
  const patchItem = (itemId: string, patch: Partial<ItemLog>) => {
    const next: WorkoutLog = {
      ...log,
      itemLogs: log.itemLogs.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
    };
    onUpdate(next);
  };

  /** Replace the note and persist. */
  const commitNote = () => {
    if (noteDraft === null) return;
    const trimmed = noteDraft.trim();
    // If unchanged, just exit edit mode without a write.
    if (trimmed === (log.note ?? '').trim()) {
      setNoteDraft(null);
      return;
    }
    onUpdate({ ...log, note: trimmed });
    setNoteDraft(null);
  };

  return (
    <SwipeableRow onDelete={onDelete} style={{ marginBottom: Spacing.sm }}>
      <View style={[styles.card, log.isPartial && styles.cardPartial]}>
        <TouchableOpacity
          onPress={() => setExpanded((e) => !e)}
          activeOpacity={0.8}
          style={styles.header}
        >
          <View style={styles.headerLeft}>
            <View style={styles.titleRow}>
              <Text style={styles.name} numberOfLines={1}>
                {log.workoutName}
              </Text>
              {log.isPartial && (
                <View style={styles.partialBadge}>
                  <Text style={styles.partialText}>PARTIAL</Text>
                </View>
              )}
            </View>

            <Text style={styles.meta}>
              {formatShortDate(log.startedAt)} · {formatTimeOfDay(log.startedAt)} ·{' '}
              {formatDuration(log.totalDurationSeconds)}
            </Text>

            <Text style={styles.progress}>
              {completedCount}/{totalCount} steps completed
            </Text>
          </View>

          <View style={styles.headerRight}>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textTertiary}
            />
          </View>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.details}>
            {/* Note: display or edit */}
            {noteDraft !== null ? (
              <View style={styles.noteEditBox}>
                <Text style={styles.noteLabel}>NOTE</Text>
                <TextInput
                  style={styles.noteInput}
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="Add a note…"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  autoFocus
                />
                <View style={styles.noteActions}>
                  <TouchableOpacity onPress={() => setNoteDraft(null)} style={styles.noteCancelBtn}>
                    <Text style={styles.noteCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={commitNote} style={styles.noteSaveBtn}>
                    <Text style={styles.noteSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.noteBox}
                onPress={() => setNoteDraft(log.note ?? '')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={log.note ? 'chatbubble-outline' : 'create-outline'}
                  size={13}
                  color={colors.textTertiary}
                />
                <Text style={styles.noteText}>
                  {log.note ? log.note : 'Add a note'}
                </Text>
              </TouchableOpacity>
            )}

            {(groupItemLogsByBlock(log.itemLogs)).map((items, idx) => {
              if (items.length === 0) return null;
              const color = getItemLogGroupColor(items);
              const dim = getItemLogGroupDim(items);
              const label = getItemLogGroupLabel(items);

              return (
                <View key={items[0].blockId ?? `block-${items[0].blockType}-${idx}`} style={styles.block}>
                  <View style={[styles.blockHeader, { backgroundColor: dim }]}>
                    <Text style={[styles.blockLabel, { color }]}>
                      {label.toUpperCase()}
                    </Text>
                  </View>
                  {items.map((item) => {
                    const isEditing = editingItemId === item.id;
                    const isUnilateral = item.repMode !== 'bilateral' && item.repsLeft != null;
                    const canEdit = !item.skipped;
                    const canEditWeight = !item.skipped && item.weight > 0;
                    return (
                      <View key={item.id}>
                        <TouchableOpacity
                          style={[styles.itemRow, !item.completed && styles.itemRowIncomplete]}
                          onPress={() => (canEdit || canEditWeight) && setEditingItemId(isEditing ? null : item.id)}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={item.skipped ? 'play-skip-forward-outline' : item.completed ? 'checkmark-circle' : 'ellipse-outline'}
                            size={16}
                            color={item.skipped ? colors.textTertiary : item.completed ? colors.success : colors.textTertiary}
                          />
                          <Text
                            style={[
                              styles.itemName,
                              (!item.completed || item.skipped) && styles.itemNameIncomplete,
                            ]}
                          >
                            {item.exerciseName}
                            {item.emomMinute ? ` (min ${item.emomMinute})` : ''}
                          </Text>
                          <Text
                            style={[
                              styles.itemDetail,
                              !item.completed && styles.itemDetailIncomplete,
                            ]}
                          >
                            {item.skipped
                              ? 'skipped'
                              : isUnilateral
                                ? `${item.repsLeft}${item.repMode === 'unilateral-fr' ? 'F' : 'L'} / ${item.repsRight ?? item.repsLeft}${item.repMode === 'unilateral-fr' ? 'R' : 'R'} reps`
                                : `${item.reps}${item.repMode !== 'bilateral' ? '×2' : ''} reps`}
                            {!item.skipped && item.weight > 0 ? ` · ${item.weight}kg` : ''}
                          </Text>
                          {(canEdit || canEditWeight) && (
                            <Ionicons
                              name={isEditing ? 'chevron-up' : 'pencil-outline'}
                              size={13}
                              color={colors.textTertiary}
                            />
                          )}
                        </TouchableOpacity>

                        {isEditing && (canEdit || canEditWeight) && (
                          <View style={styles.itemEditSection}>
                            {/* Reps (skip for pure-duration items — they have no reps field to edit here) */}
                            {canEdit && (
                              <View style={styles.fieldRow}>
                                <Text style={styles.fieldLabel}>REPS</Text>
                                {isUnilateral ? (
                                  <View style={styles.sidesRow}>
                                    <View style={styles.sideField}>
                                      <Text style={styles.sideLabel}>{item.repMode === 'unilateral-fr' ? 'F' : 'L'}</Text>
                                      <NumericInput
                                        style={[styles.numInput, { borderColor: color }]}
                                        value={item.repsLeft ?? 0}
                                        onCommit={(n) => patchItem(item.id, { repsLeft: n })}
                                        selectTextOnFocus
                                      />
                                    </View>
                                    <View style={styles.sideField}>
                                      <Text style={styles.sideLabel}>{item.repMode === 'unilateral-fr' ? 'R' : 'R'}</Text>
                                      <NumericInput
                                        style={[styles.numInput, { borderColor: color }]}
                                        value={item.repsRight ?? item.repsLeft ?? 0}
                                        onCommit={(n) => patchItem(item.id, { repsRight: n })}
                                        selectTextOnFocus
                                      />
                                    </View>
                                  </View>
                                ) : (
                                  <NumericInput
                                    style={[styles.numInput, { borderColor: color }]}
                                    value={item.reps}
                                    onCommit={(n) => patchItem(item.id, { reps: n })}
                                    selectTextOnFocus
                                  />
                                )}
                              </View>
                            )}

                            {/* Weight */}
                            {canEditWeight && (
                              <View style={styles.fieldRow}>
                                <Text style={styles.fieldLabel}>WEIGHT (kg)</Text>
                                <NumericInput
                                  style={[styles.numInput, { borderColor: color }]}
                                  value={item.weight}
                                  onCommit={(n) => patchItem(item.id, { weight: n })}
                                  isFloat
                                  selectTextOnFocus
                                />
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </SwipeableRow>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    cardPartial: {
      borderColor: c.warningDim,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    headerLeft: {
      flex: 1,
      gap: 4,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flexWrap: 'wrap',
    },
    name: {
      ...Typography.bodyBold,
      color: c.textPrimary,
    },
    partialBadge: {
      backgroundColor: c.warningDim,
      borderRadius: Radius.full,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    partialText: {
      ...Typography.tiny,
      color: c.warning,
      letterSpacing: 0.5,
    },
    meta: {
      ...Typography.caption,
      color: c.textTertiary,
    },
    progress: {
      ...Typography.captionBold,
      color: c.textSecondary,
    },
    details: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingBottom: Spacing.sm,
    },
    noteBox: {
      flexDirection: 'row',
      gap: Spacing.xs,
      alignItems: 'flex-start',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      backgroundColor: c.surfaceElevated,
      marginBottom: Spacing.xs,
    },
    noteText: {
      ...Typography.caption,
      color: c.textSecondary,
      flex: 1,
      lineHeight: 18,
    },
    noteEditBox: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      backgroundColor: c.surfaceElevated,
      marginBottom: Spacing.xs,
      gap: Spacing.xs,
    },
    noteLabel: { ...Typography.tiny, color: c.textTertiary, letterSpacing: 1.5 },
    noteInput: {
      backgroundColor: c.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: Spacing.sm,
      ...Typography.body,
      color: c.textPrimary,
      minHeight: 72,
      textAlignVertical: 'top',
    },
    noteActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: Spacing.sm,
    },
    noteCancelBtn: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      borderRadius: Radius.md,
    },
    noteCancelText: { ...Typography.captionBold, color: c.textTertiary },
    noteSaveBtn: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      borderRadius: Radius.md,
      backgroundColor: c.accent,
    },
    noteSaveText: { ...Typography.captionBold, color: '#fff' },
    block: {
      marginTop: Spacing.sm,
    },
    blockHeader: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 4,
      marginBottom: Spacing.xs,
    },
    blockLabel: {
      ...Typography.tiny,
      letterSpacing: 1.5,
      fontWeight: '700',
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: 5,
    },
    itemRowIncomplete: {
      opacity: 0.45,
    },
    itemName: {
      ...Typography.body,
      color: c.textPrimary,
      flex: 1,
    },
    itemNameIncomplete: {
      textDecorationLine: 'line-through',
      color: c.textTertiary,
    },
    itemDetail: {
      ...Typography.caption,
      color: c.textTertiary,
    },
    itemDetailIncomplete: {
      textDecorationLine: 'line-through',
    },
    itemEditSection: {
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
      gap: Spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surfaceElevated,
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
      paddingTop: Spacing.sm,
    },
    fieldLabel: { ...Typography.tiny, color: c.textTertiary, letterSpacing: 1.5 },
    numInput: {
      color: c.textPrimary,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      minWidth: 64,
      textAlign: 'center',
      ...Typography.body,
    },
    sidesRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    sideField: {
      alignItems: 'center',
      gap: 2,
    },
    sideLabel: { ...Typography.tiny, color: c.textTertiary },
  });
}
