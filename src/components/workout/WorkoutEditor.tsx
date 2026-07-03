import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WorkoutTemplate, WorkoutBlock, CustomBlockDef } from '../../models';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import { getBlockDisplayColor, getBlockDisplayDim, getBlockDisplayLabel } from '../../utils/helpers';
import { generateId } from '../../utils/helpers';
import { useSettings } from '../../context/SettingsContext';
import BlockSection from './BlockSection';
import NumericInput from '../common/NumericInput';

interface Props {
  template: WorkoutTemplate;
  onSave: (template: WorkoutTemplate) => void;
  onCancel: () => void;
}

export default function WorkoutEditor({ template, onSave, onCancel }: Props) {
  const { top } = useSafeAreaInsets();
  const { settings, colors } = useSettings();
  const styles = makeStyles(colors);
  const [draft, setDraft] = useState<WorkoutTemplate>(template);
  const [addingBlock, setAddingBlock] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const blockDefs: CustomBlockDef[] = settings.customBlockDefs;

  const updateBlocks = (blocks: WorkoutBlock[]) =>
    setDraft((prev) => ({ ...prev, blocks }));

  const addBlockFromDef = (def: CustomBlockDef) => {
    const newBlock: WorkoutBlock = {
      id: generateId(),
      type: def.baseType === 'emom' ? 'emom' : 'starter',
      items: [],
      emomMinutes: def.baseType === 'emom' ? 20 : undefined,
      customBlockDefId: def.id,
      customLabel: def.label,
      customColor: def.color,
    };
    updateBlocks([...draft.blocks, newBlock]);
    setAddingBlock(false);
  };

  const removeBlock = (id: string) =>
    updateBlocks(draft.blocks.filter((b) => b.id !== id));

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= draft.blocks.length) return;
    const blocks = [...draft.blocks];
    [blocks[idx], blocks[next]] = [blocks[next], blocks[idx]];
    updateBlocks(blocks);
  };

  const updateBlockItems = (id: string, items: WorkoutBlock['items']) =>
    updateBlocks(draft.blocks.map((b) => (b.id === id ? { ...b, items } : b)));

  const updateBlockEmomMinutes = (id: string, n: number) =>
    updateBlocks(draft.blocks.map((b) => (b.id === id ? { ...b, emomMinutes: n } : b)));

  const alarmEnabled = draft.alarmMinutes !== undefined;

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {template.name === 'New Workout' ? 'New Workout' : 'Edit Workout'}
          </Text>
          <TouchableOpacity onPress={() => onSave(draft)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
        >
          {/* ─── Name ─── */}
          <View style={styles.nameCard}>
            <Ionicons name="create-outline" size={18} color={colors.textTertiary} />
            <TextInput
              style={styles.nameInput}
              value={draft.name}
              onChangeText={(name) => setDraft((prev) => ({ ...prev, name }))}
              placeholder="Workout name"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="done"
              autoCorrect={false}
            />
          </View>

          {/* ─── Alarm ─── */}
          <View style={styles.alarmCard}>
            <View style={styles.alarmRow}>
              <Ionicons name="alarm-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.alarmLabel}>Alarm</Text>
              <View style={styles.flex1} />
              <Switch
                value={alarmEnabled}
                onValueChange={(enabled) =>
                  setDraft((prev) => ({ ...prev, alarmMinutes: enabled ? 20 : undefined }))
                }
                trackColor={{ false: colors.border, true: `${colors.accent}66` }}
                thumbColor={alarmEnabled ? colors.accent : colors.textTertiary}
              />
            </View>
            {alarmEnabled && (
              <View style={styles.alarmMinutesRow}>
                <Text style={styles.alarmMinutesLabel}>Alert after</Text>
                <NumericInput
                  style={styles.alarmMinutesInput}
                  value={draft.alarmMinutes ?? 20}
                  onCommit={(n) => setDraft((prev) => ({ ...prev, alarmMinutes: n }))}
                  min={1}
                  max={300}
                  returnKeyType="done"
                  selectTextOnFocus
                />
                <Text style={styles.alarmMinutesUnit}>min</Text>
              </View>
            )}
          </View>

          {/* ─── Blocks ─── */}
          {draft.blocks.map((block, idx) => {
            const color = getBlockDisplayColor(block);
            const dim = getBlockDisplayDim(block);
            const label = getBlockDisplayLabel(block);
            return (
              <View key={block.id}>
                <View style={styles.blockControlRow}>
                  <View style={styles.orderBtns}>
                    <TouchableOpacity
                      onPress={() => moveBlock(idx, -1)}
                      disabled={idx === 0}
                      style={[styles.orderBtn, idx === 0 && styles.orderBtnDisabled]}
                    >
                      <Ionicons name="chevron-up" size={16} color={color} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveBlock(idx, 1)}
                      disabled={idx === draft.blocks.length - 1}
                      style={[styles.orderBtn, idx === draft.blocks.length - 1 && styles.orderBtnDisabled]}
                    >
                      <Ionicons name="chevron-down" size={16} color={color} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeBlock(block.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle-outline" size={20} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>

                <BlockSection
                  title={label}
                  blockType={block.type}
                  accentColor={color}
                  items={block.items}
                  showRestTime={block.type !== 'emom'}
                  onChange={(items) => updateBlockItems(block.id, items)}
                  onScrollLock={setScrollEnabled}
                >
                  {block.type === 'emom' && (
                    <View style={[styles.emomConfig, { borderColor: `${color}44` }]}>
                      <Text style={styles.emomLabel}>Total duration</Text>
                      <View style={styles.emomDurationRow}>
                        <NumericInput
                          style={[styles.emomDurationInput, { color, borderColor: `${color}88` }]}
                          value={block.emomMinutes ?? 20}
                          onCommit={(n) => updateBlockEmomMinutes(block.id, n)}
                          min={1}
                          returnKeyType="done"
                          selectTextOnFocus
                        />
                        <Text style={styles.emomUnit}>min</Text>
                      </View>
                    </View>
                  )}
                </BlockSection>
              </View>
            );
          })}

          {/* ─── Add block ─── */}
          {addingBlock ? (
            <View style={styles.pickerCard}>
              <Text style={styles.pickerTitle}>Choose block type</Text>
              {blockDefs.length === 0 ? (
                <Text style={styles.pickerEmptyText}>
                  No block types defined.{'\n'}Configure them in Profile → Settings → Workouts.
                </Text>
              ) : (
                <View style={styles.pickerGrid}>
                  {blockDefs.map((def) => (
                    <TouchableOpacity
                      key={def.id}
                      onPress={() => addBlockFromDef(def)}
                      activeOpacity={0.7}
                      style={[styles.pickerBtn, { borderColor: def.color, backgroundColor: `${def.color}22` }]}
                    >
                      <View style={[styles.pickerDot, { backgroundColor: def.color }]} />
                      <Text style={[styles.pickerBtnText, { color: def.color }]}>{def.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity onPress={() => setAddingBlock(false)} style={styles.pickerCancel}>
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setAddingBlock(true)}
              activeOpacity={0.7}
              style={styles.addBlockBtn}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
              <Text style={styles.addBlockBtnText}>Add Block</Text>
            </TouchableOpacity>
          )}

          <View style={styles.bottomPad} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    flex1: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    cancelText: { ...Typography.body, color: c.textSecondary },
    headerTitle: { ...Typography.h3, color: c.textPrimary },
    saveText: { ...Typography.bodyBold, color: c.accent },
    content: { padding: Spacing.md, paddingTop: Spacing.lg },
    nameCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.xl,
    },
    nameInput: {
      flex: 1,
      ...Typography.h2,
      color: c.textPrimary,
      paddingVertical: Spacing.xs,
    },
    alarmCard: {
      backgroundColor: c.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.xl,
      gap: Spacing.xs,
    },
    alarmRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: 4,
    },
    alarmLabel: { ...Typography.body, color: c.textPrimary },
    alarmMinutesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingTop: Spacing.xs,
      paddingLeft: 26,
    },
    alarmMinutesLabel: { ...Typography.caption, color: c.textSecondary, flex: 1 },
    alarmMinutesInput: {
      ...Typography.h3,
      color: c.accent,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: `${c.accent}88`,
      borderRadius: Radius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      minWidth: 52,
      textAlign: 'center',
    },
    alarmMinutesUnit: { ...Typography.body, color: c.textTertiary },
    pickerEmptyText: { ...Typography.caption, color: c.textTertiary, textAlign: 'center', paddingVertical: Spacing.sm },
    blockControlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.xs,
      marginBottom: -Spacing.xs,
    },
    orderBtns: { flexDirection: 'row', gap: Spacing.xs },
    orderBtn: { padding: 4 },
    orderBtnDisabled: { opacity: 0.25 },
    emomConfig: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.surfaceElevated,
      borderRadius: Radius.md,
      borderWidth: 1,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    emomLabel: { ...Typography.body, color: c.textSecondary },
    emomDurationRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    emomDurationInput: {
      ...Typography.h3,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      minWidth: 52,
      textAlign: 'center',
    },
    emomUnit: { ...Typography.body, color: c.textTertiary },
    addBlockBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.accent,
      marginTop: Spacing.sm,
    },
    addBlockBtnText: { ...Typography.bodyBold, color: c.accent },
    pickerCard: {
      backgroundColor: c.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: Spacing.md,
      gap: Spacing.md,
      marginTop: Spacing.sm,
    },
    pickerTitle: { ...Typography.captionBold, color: c.textSecondary, textAlign: 'center' },
    pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    pickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.md,
      borderWidth: 1,
    },
    pickerDot: { width: 8, height: 8, borderRadius: 4 },
    pickerBtnText: { ...Typography.captionBold },
    pickerCancel: { alignItems: 'center', paddingVertical: Spacing.xs },
    pickerCancelText: { ...Typography.caption, color: c.textTertiary },
    bottomPad: { height: 60 },
  });
}
