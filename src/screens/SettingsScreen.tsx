import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { CustomBlockDef, DEFAULT_BLOCK_DEFS } from '../models';
import { Spacing, Radius, Typography } from '../theme';
import { generateId } from '../utils/helpers';
import ImportScreen from './ImportScreen';

const COLOR_PALETTE = [
  '#FF6B35', '#60A5FA', '#A78BFA', '#4ADE80',
  '#FBBF24', '#F472B6', '#2DD4BF', '#FB923C',
  '#E879F9', '#34D399', '#F87171', '#38BDF8',
];

interface Props {
  onClose: () => void;
}

export default function SettingsScreen({ onClose }: Props) {
  const { settings, updateSettings, colors } = useSettings();
  const [editingBlock, setEditingBlock] = useState<CustomBlockDef | null>(null);
  const [isAddingBlock, setIsAddingBlock] = useState(false);

  // ── Block def editor state ──────────────────────────────────────────────────
  const emptyDef = (): CustomBlockDef => ({
    id: generateId(),
    label: '',
    color: COLOR_PALETTE[0],
    baseType: 'standard',
  });

  const [blockDraft, setBlockDraft] = useState<CustomBlockDef>(emptyDef());
  const [showImport, setShowImport] = useState(false);

  const openAdd = () => {
    setBlockDraft(emptyDef());
    setIsAddingBlock(true);
    setEditingBlock(null);
  };

  const openEdit = (def: CustomBlockDef) => {
    setBlockDraft({ ...def });
    setEditingBlock(def);
    setIsAddingBlock(false);
  };

  const closeBlockEditor = () => {
    setIsAddingBlock(false);
    setEditingBlock(null);
  };

  const saveBlockDef = () => {
    if (!blockDraft.label.trim()) {
      Alert.alert('Label required', 'Please enter a name for the block type.');
      return;
    }
    const defs = editingBlock
      ? settings.customBlockDefs.map((d) => (d.id === editingBlock.id ? { ...blockDraft, label: blockDraft.label.trim() } : d))
      : [...settings.customBlockDefs, { ...blockDraft, label: blockDraft.label.trim() }];
    updateSettings({ customBlockDefs: defs });
    closeBlockEditor();
  };

  const deleteBlockDef = (id: string) => {
    Alert.alert('Delete block type?', 'Existing workout blocks of this type are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => updateSettings({ customBlockDefs: settings.customBlockDefs.filter((d) => d.id !== id) }),
      },
    ]);
  };

  const resetBlockDefs = () => {
    Alert.alert('Reset to defaults?', 'This replaces your custom block types with the built-in defaults.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => updateSettings({ customBlockDefs: DEFAULT_BLOCK_DEFS }) },
    ]);
  };

  const showingEditor = isAddingBlock || editingBlock !== null;
  const { top } = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: top + Spacing.md, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >


          <Text style={[styles.groupLabel, { color: colors.textTertiary }]}>GENERAL</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>

            {/* Theme */}
            <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Theme</Text>
            <View style={styles.segmentRow}>
              {(['light', 'dark', 'system'] as const).map((opt) => {
                const active = settings.theme === opt;
                const labels = { light: 'Light', dark: 'Dark', system: 'System' };
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.segment,
                      { borderColor: active ? colors.accent : colors.border },
                      active && { backgroundColor: colors.accentDim },
                    ]}
                    onPress={() => updateSettings({ theme: opt })}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.segmentText, { color: active ? colors.accent : colors.textSecondary }]}>
                      {labels[opt]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* AI exercise lookup — now runs server-side */}
            <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>AI exercise lookup</Text>
            <Text style={[styles.rowHint, { color: colors.textTertiary }]}>
              AI exercise enrichment now runs through your Supabase backend. The
              Perplexity API key is stored as an Edge Function secret and is no
              longer entered in the app.
            </Text>
            <View style={styles.apiKeyStatus}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
              <Text style={[styles.apiKeyStatusText, { color: colors.success }]}>
                Server-managed — sign in to use AI lookup
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Migrate data from the legacy app */}
            <TouchableOpacity
              style={styles.migrateRow}
              onPress={() => setShowImport(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="cloud-download-outline" size={18} color={colors.accent} />
              <View style={styles.migrateText}>
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Migrate data</Text>
                <Text style={[styles.rowHint, { color: colors.textTertiary }]}>
                  Import from a previous KBC export file
                </Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* ── Workouts ────────────────────────────────────────────────────── */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.groupLabel, { color: colors.textTertiary, marginBottom: 0 }]}>WORKOUTS — BLOCK TYPES</Text>
            <TouchableOpacity onPress={resetBlockDefs} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.resetText, { color: colors.textTertiary }]}>Reset</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {settings.customBlockDefs.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                No block types defined. Tap + to add one.
              </Text>
            ) : (
              settings.customBlockDefs.map((def, idx) => (
                <View key={def.id}>
                  <View style={styles.blockDefRow}>
                    <View style={[styles.colorDot, { backgroundColor: def.color }]} />
                    <View style={styles.blockDefInfo}>
                      <Text style={[styles.blockDefLabel, { color: colors.textPrimary }]}>{def.label}</Text>
                      <Text style={[styles.blockDefType, { color: colors.textTertiary }]}>
                        {def.baseType === 'emom' ? 'EMOM' : 'Standard'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => openEdit(def)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="pencil-outline" size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteBlockDef(def.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                  {idx < settings.customBlockDefs.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  )}
                </View>
              ))
            )}
          </View>

          {!showingEditor && (
            <TouchableOpacity
              style={[styles.addBlockBtn, { borderColor: colors.accent }]}
              onPress={openAdd}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
              <Text style={[styles.addBlockBtnText, { color: colors.accent }]}>Add block type</Text>
            </TouchableOpacity>
          )}

          {/* Block editor */}
          {showingEditor && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
              <Text style={[styles.editorTitle, { color: colors.textPrimary }]}>
                {isAddingBlock ? 'New block type' : 'Edit block type'}
              </Text>

              <Text style={[styles.editorLabel, { color: colors.textSecondary }]}>Name</Text>
              <TextInput
                style={[styles.editorInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                value={blockDraft.label}
                onChangeText={(label) => setBlockDraft((p) => ({ ...p, label }))}
                placeholder="Block name"
                placeholderTextColor={colors.textTertiary}
                returnKeyType="done"
                autoFocus={isAddingBlock}
              />

              <Text style={[styles.editorLabel, { color: colors.textSecondary }]}>Type</Text>
              <View style={styles.segmentRow}>
                {(['standard', 'emom'] as const).map((t) => {
                  const active = blockDraft.baseType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.segment,
                        { borderColor: active ? colors.accent : colors.border },
                        active && { backgroundColor: colors.accentDim },
                      ]}
                      onPress={() => setBlockDraft((p) => ({ ...p, baseType: t }))}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.segmentText, { color: active ? colors.accent : colors.textSecondary }]}>
                        {t === 'emom' ? 'EMOM' : 'Standard'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.editorLabel, { color: colors.textSecondary }]}>Color</Text>
              <View style={styles.colorGrid}>
                {COLOR_PALETTE.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      blockDraft.color === c && styles.colorSwatchSelected,
                    ]}
                    onPress={() => setBlockDraft((p) => ({ ...p, color: c }))}
                    activeOpacity={0.7}
                  />
                ))}
              </View>

              <View style={styles.editorActions}>
                <TouchableOpacity
                  style={[styles.editorBtn, { borderColor: colors.border }]}
                  onPress={closeBlockEditor}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.editorBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editorBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={saveBlockDef}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.editorBtnText, { color: '#fff' }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showImport} animationType="slide" onRequestClose={() => setShowImport(false)}>
        <ImportScreen onClose={() => setShowImport(false)} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: { ...Typography.h3 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.md },
  groupLabel: {
    ...Typography.tiny,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  resetText: { ...Typography.caption },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  rowLabel: { ...Typography.bodyBold },
  rowHint: { ...Typography.caption, marginTop: -4 },
  segmentRow: { flexDirection: 'row', gap: Spacing.sm },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  segmentText: { ...Typography.captionBold },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs },
  apiKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    gap: Spacing.sm,
  },
  apiKeyInput: { flex: 1, ...Typography.body },
  apiKeyStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  apiKeyStatusText: { ...Typography.caption },
  migrateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  migrateText: { flex: 1 },
  blockDefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  blockDefInfo: { flex: 1 },
  blockDefLabel: { ...Typography.bodyBold },
  blockDefType: { ...Typography.caption },
  emptyText: { ...Typography.body, textAlign: 'center', paddingVertical: Spacing.sm },
  addBlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addBlockBtnText: { ...Typography.bodyBold },
  editorTitle: { ...Typography.h3, marginBottom: Spacing.xs },
  editorLabel: { ...Typography.captionBold, letterSpacing: 0.5 },
  editorInput: {
    ...Typography.body,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    transform: [{ scale: 1.15 }],
  },
  editorActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  editorBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  editorBtnText: { ...Typography.bodyBold },
});
