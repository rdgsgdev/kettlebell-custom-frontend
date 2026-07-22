// TemplatePreviewCard — renders an AI-generated workout as a compact preview
// with Save / Discard actions. The AI doesn't produce ids/timestamps; we assign
// them here via generateId() when the user saves.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import { useSettings } from '../../context/SettingsContext';
import { useAppContext } from '../../context/AppContext';
import {
  WorkoutTemplate,
  WorkoutBlock,
  WorkoutItem,
  RepMode,
  BlockType,
  Exercise,
  TargetedMuscle,
  CustomBlockDef,
} from '../../models';
import { generateId } from '../../utils/helpers';
import type { AITemplate, AIExerciseProposal, AICustomBlockDef } from '../../services/ai';

interface Props {
  template: AITemplate;
  /** New exercises the AI proposed alongside the template (optional). */
  exercises?: AIExerciseProposal[];
  /** New custom block defs the AI proposed (optional). */
  customBlockDefs?: AICustomBlockDef[];
  onSaved?: () => void;
  onDiscard?: () => void;
}

const VALID_BLOCK_TYPES: BlockType[] = ['starter', 'emom', 'finisher', 'mobility', 'stretching'];
const VALID_REP_MODES: RepMode[] = ['bilateral', 'unilateral', 'unilateral-fr'];

function coerceBlockType(s: string): BlockType {
  return (VALID_BLOCK_TYPES.includes(s as BlockType) ? s : 'starter') as BlockType;
}
function coerceRepMode(s: string): RepMode {
  return (VALID_REP_MODES.includes(s as RepMode) ? s : 'bilateral') as RepMode;
}

export default function TemplatePreviewCard({
  template,
  exercises,
  customBlockDefs,
  onSaved,
  onDiscard,
}: Props) {
  const { colors } = useSettings();
  const { saveTemplate, saveExercise } = useAppContext();
  const { settings, updateSettings } = useSettings();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      // 1. Merge any new custom block defs into settings.
      if (customBlockDefs && customBlockDefs.length) {
        const existingLabels = new Set(settings.customBlockDefs.map((d) => d.label.toLowerCase()));
        const newDefs: CustomBlockDef[] = customBlockDefs
          .filter((d) => !existingLabels.has(d.label.toLowerCase()))
          .map((d) => ({
            id: generateId(),
            label: d.label,
            color: d.color,
            baseType: d.baseType,
          }));
        if (newDefs.length) {
          updateSettings({ ...settings, customBlockDefs: [...settings.customBlockDefs, ...newDefs] });
        }
      }

      // 2. Save any new exercises to the library.
      if (exercises && exercises.length) {
        for (const ex of exercises) {
          const muscles: TargetedMuscle[] = ex.muscles.map((m) => ({
            group: m.group as any,
            isPrimary: m.isPrimary,
          }));
          const newEx: Exercise = {
            id: generateId(),
            name: ex.name,
            repMode: coerceRepMode(ex.repMode),
            category: (ex.category as any) || 'strength',
            description: ex.description,
            muscles,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await saveExercise(newEx);
        }
      }

      // 3. Save the template with fresh ids + timestamps.
      const now = new Date().toISOString();
      const blocks: WorkoutBlock[] = template.blocks.map((b) => ({
        id: generateId(),
        type: coerceBlockType(b.type),
        items: b.items.map(
          (it): WorkoutItem => ({
            id: generateId(),
            exerciseName: it.exerciseName,
            repMode: coerceRepMode(it.repMode),
            reps: it.reps,
            sets: it.sets,
            weight: it.weight,
            restTime: it.restTime,
            durationSeconds: it.durationSeconds,
          }),
        ),
        emomMinutes: b.emomMinutes,
        customLabel: b.customLabel,
        customColor: b.customColor,
      }));
      const tpl: WorkoutTemplate = {
        id: generateId(),
        name: template.name,
        blocks,
        createdAt: now,
        updatedAt: now,
        alarmMinutes: template.alarmMinutes,
      };
      await saveTemplate(tpl);

      setSaved(true);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Ionicons name="barbell" size={16} color={colors.accent} />
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {template.name}
        </Text>
      </View>

      {template.blocks.map((b, bi) => {
        const label = b.customLabel || b.type;
        const color = b.customColor || colors.accent;
        return (
          <View key={bi} style={styles.blockRow}>
            <View style={[styles.blockTag, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
              <Text style={[styles.blockTagText, { color }]}>{label.toUpperCase()}</Text>
            </View>
            <View style={styles.blockItems}>
              {b.type === 'emom' && b.emomMinutes != null && (
                <Text style={[styles.emomMeta, { color: colors.textTertiary }]}>
                  {b.emomMinutes} min EMOM
                </Text>
              )}
              {b.items.map((it, ii) => (
                <Text key={ii} style={[styles.itemText, { color: colors.textSecondary }]}>
                  {it.exerciseName} · {it.reps}r{it.sets ? `×${it.sets}` : ''}
                  {it.weight ? ` @${it.weight}kg` : ''}
                </Text>
              ))}
            </View>
          </View>
        );
      })}

      {exercises && exercises.length > 0 && (
        <Text style={[styles.note, { color: colors.textTertiary }]}>
          + {exercises.length} new exercise{exercises.length > 1 ? 's' : ''} to add
        </Text>
      )}

      {!saved ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.accent }, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Ionicons name="save-outline" size={15} color="#fff" />
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Workout'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.discardBtn, { borderColor: colors.border }]}
            onPress={onDiscard}
            activeOpacity={0.7}
          >
            <Text style={[styles.discardBtnText, { color: colors.textSecondary }]}>Discard</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.savedRow, { backgroundColor: colors.successDim }]}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={[styles.savedText, { color: colors.success }]}>Saved to your workouts</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 2,
  },
  title: { ...Typography.bodyBold, fontSize: 15, flexShrink: 1 },
  blockRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  blockTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
  },
  blockTagText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  blockItems: { flex: 1, gap: 1 },
  emomMeta: { fontSize: 11, fontStyle: 'italic' },
  itemText: { fontSize: 12, lineHeight: 16 },
  note: { fontSize: 11, fontStyle: 'italic', paddingTop: 2 },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
  },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  discardBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  discardBtnText: { fontSize: 13, fontWeight: '600' },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  savedText: { fontSize: 13, fontWeight: '600' },
});
