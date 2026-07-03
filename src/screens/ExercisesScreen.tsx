import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { useSettings } from '../context/SettingsContext';
import {
  Exercise,
  ExerciseCategory,
  MuscleGroup,
  RepMode,
  TargetedMuscle,
} from '../models';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { generateId } from '../utils/helpers';
import { generateExerciseFromAI, AIExerciseResult } from '../services/ai';
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  MUSCLE_LABELS,
  ALL_MUSCLE_GROUPS,
} from '../utils/exercises';
import MuscleDiagram from '../components/exercises/MuscleDiagram';
import ExerciseCard from '../components/exercises/ExerciseCard';
import YoutubePlayer from '../components/exercises/YoutubePlayer';

const ALL_CATEGORIES: ExerciseCategory[] = [
  'strength', 'cardio', 'flexibility', 'balance',
];
const ALL_REP_MODES: { value: RepMode; label: string }[] = [
  { value: 'bilateral', label: 'Bilateral' },
  { value: 'unilateral', label: 'L / R' },
  { value: 'unilateral-fr', label: 'F / R' },
];

function emptyDraft(): Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: '',
    category: 'strength',
    repMode: 'bilateral',
    muscles: [],
    description: '',
  };
}

export default function ExercisesScreen() {
  const { exercises, saveExercise, deleteExercise } = useAppContext();
  const { settings, colors } = useSettings();
  const styles = makeStyles(colors);
  const hasApiKey = true; // AI lookup now runs server-side via the ai-exercise edge function.
  const [search, setSearch] = useState('');
  const [modalMode, setModalMode] = useState<'none' | 'choose' | 'ai' | 'manual'>('none');
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategories, setFilterCategories] = useState<ExerciseCategory[]>([]);
  const [filterRepModes, setFilterRepModes] = useState<RepMode[]>([]);
  const [filterMuscles, setFilterMuscles] = useState<MuscleGroup[]>([]);

  const toggleFilterCategory = (cat: ExerciseCategory) =>
    setFilterCategories((prev) => prev.includes(cat) ? prev.filter((x) => x !== cat) : [...prev, cat]);
  const toggleFilterRepMode = (mode: RepMode) =>
    setFilterRepModes((prev) => prev.includes(mode) ? prev.filter((x) => x !== mode) : [...prev, mode]);
  const toggleFilterMuscle = (group: MuscleGroup) =>
    setFilterMuscles((prev) => prev.includes(group) ? prev.filter((x) => x !== group) : [...prev, group]);

  const activeFilterCount = filterCategories.length + filterRepModes.length + filterMuscles.length;

  const filtered = exercises
    .filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()))
    .filter((e) => filterCategories.length === 0 || filterCategories.includes(e.category))
    .filter((e) => filterRepModes.length === 0 || filterRepModes.includes(e.repMode))
    .filter((e) => filterMuscles.length === 0 || e.muscles.some((m) => filterMuscles.includes(m.group)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const openCreate = () => setModalMode('choose');
  const closeModal = () => setModalMode('none');

  const handleDelete = (id: string) => {
    deleteExercise(id);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Exercises</Text>
        <Text style={[styles.subtitle, { color: colors.textTertiary }]}>{exercises.length} in library</Text>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.textTertiary} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises…"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="search"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter bar */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterToggleBtn, activeFilterCount > 0 && styles.filterToggleBtnActive]}
          onPress={() => setShowFilters((v) => !v)}
          activeOpacity={0.7}
        >
          <Ionicons name="options-outline" size={15} color={activeFilterCount > 0 ? colors.accent : colors.textSecondary} />
          <Text style={[styles.filterToggleText, activeFilterCount > 0 && styles.filterToggleTextActive]}>
            {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
          </Text>
        </TouchableOpacity>
        {activeFilterCount > 0 && (
          <TouchableOpacity
            onPress={() => { setFilterCategories([]); setFilterRepModes([]); setFilterMuscles([]); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.clearFiltersText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {showFilters && (
        <View style={styles.filterPanel}>
          <Text style={styles.filterSectionLabel}>CATEGORY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
            {ALL_CATEGORIES.map((cat) => {
              const active = filterCategories.includes(cat);
              const c = CATEGORY_COLORS[cat];
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.filterChip, active && { borderColor: c, backgroundColor: `${c}22` }]}
                  onPress={() => toggleFilterCategory(cat)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, active && { color: c }]}>{CATEGORY_LABELS[cat]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.filterSectionLabel, { marginTop: Spacing.sm }]}>REP MODE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
            {ALL_REP_MODES.map(({ value, label }) => {
              const active = filterRepModes.includes(value);
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.filterChip, active && { borderColor: colors.accent, backgroundColor: `${colors.accent}22` }]}
                  onPress={() => toggleFilterRepMode(value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, active && { color: colors.accent }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.filterSectionLabel, { marginTop: Spacing.sm }]}>MUSCLES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
            {ALL_MUSCLE_GROUPS.map((group) => {
              const active = filterMuscles.includes(group);
              return (
                <TouchableOpacity
                  key={group}
                  style={[styles.filterChip, active && { borderColor: colors.accent, backgroundColor: `${colors.accent}22` }]}
                  onPress={() => toggleFilterMuscle(group)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, active && { color: colors.accent }]}>{MUSCLE_LABELS[group]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        renderItem={({ item }) => (
          <ExerciseCard
            exercise={item}
            onPress={() => setEditingExercise(item)}
            onDelete={() => handleDelete(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={56} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>
              {exercises.length === 0 ? 'No exercises yet' : 'No match found'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {exercises.length === 0
                ? 'Tap + to create your first exercise\nusing AI or manually'
                : 'Try adjusting your search or filters'}
            </Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openCreate} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Create mode chooser */}
      <Modal
        visible={modalMode === 'choose'}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeModal}>
          <View style={[styles.chooseSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.chooseTitle, { color: colors.textPrimary }]}>Add Exercise</Text>
            <TouchableOpacity
              style={[styles.chooseOption, !hasApiKey && { opacity: 0.4 }]}
              activeOpacity={0.8}
              onPress={() => hasApiKey && setModalMode('ai')}
              disabled={!hasApiKey}
            >
              <View style={[styles.chooseIcon, { backgroundColor: 'rgba(255,107,53,0.15)' }]}>
                <Ionicons name="sparkles-outline" size={22} color={colors.accent} />
              </View>
              <View style={styles.chooseText}>
                <Text style={[styles.chooseOptionTitle, { color: colors.textPrimary }]}>Generate with AI</Text>
                <Text style={[styles.chooseOptionSub, { color: colors.textSecondary }]}>
                  {hasApiKey ? 'Type a name — AI fills in details' : 'No API key — configure in Settings'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chooseOption}
              activeOpacity={0.8}
              onPress={() => setModalMode('manual')}
            >
              <View style={[styles.chooseIcon, { backgroundColor: colors.surfaceElevated }]}>
                <Ionicons name="create-outline" size={22} color={colors.textSecondary} />
              </View>
              <View style={styles.chooseText}>
                <Text style={[styles.chooseOptionTitle, { color: colors.textPrimary }]}>Create Manually</Text>
                <Text style={[styles.chooseOptionSub, { color: colors.textSecondary }]}>Fill in all fields yourself</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* AI creation modal */}
      {modalMode === 'ai' && (
        <AICreateModal
          onClose={closeModal}
          onSave={async (ex) => {
            await saveExercise(ex);
            closeModal();
          }}
        />
      )}

      {/* Manual creation modal */}
      {modalMode === 'manual' && (
        <ExerciseFormModal
          initialDraft={emptyDraft()}
          onClose={closeModal}
          onSave={async (ex) => {
            await saveExercise(ex);
            closeModal();
          }}
        />
      )}

      {/* Edit exercise modal */}
      {editingExercise && (
        <ExerciseFormModal
          initialDraft={{
            name: editingExercise.name,
            category: editingExercise.category,
            repMode: editingExercise.repMode,
            muscles: editingExercise.muscles,
            description: editingExercise.description,
            videoUrl: editingExercise.videoUrl,
          }}
          existingId={editingExercise.id}
          existingCreatedAt={editingExercise.createdAt}
          onClose={() => setEditingExercise(null)}
          onSave={async (ex) => {
            await saveExercise(ex);
            setEditingExercise(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Create Modal
// ─────────────────────────────────────────────────────────────────────────────

function AICreateModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (exercise: Exercise) => Promise<void>;
}) {
  const { top } = useSafeAreaInsets();
  const { settings, colors } = useSettings();
  const styles = makeStyles(colors);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIExerciseResult | null>(null);
  // editable draft derived from AI result
  const [draft, setDraft] = useState<Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'> | null>(null);
  const [saving, setSaving] = useState(false);

  const generate = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setDraft(null);
    try {
      const ai = await generateExerciseFromAI(query.trim());
      setResult(ai);
      setDraft({
        name: ai.name || query.trim(),
        category: ai.category,
        repMode: ai.repMode,
        muscles: ai.muscles,
        description: ai.description,
        videoUrl: ai.videoUrl,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await onSave({
        id: generateId(),
        ...draft,
        createdAt: now,
        updatedAt: now,
      });
    } finally {
      setSaving(false);
    }
  };

  const color = draft ? CATEGORY_COLORS[draft.category] : colors.accent;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: top }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Nav */}
          <View style={styles.modalNav}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.navCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>AI Exercise</Text>
            {draft ? (
              <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={[styles.navSave, saving && { opacity: 0.5 }]}>Save</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 44 }} />
            )}
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Search input */}
            <View style={styles.aiSearchRow}>
              <TextInput
                style={styles.aiSearchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Exercise name (e.g. Turkish Get-Up)"
                placeholderTextColor={colors.textTertiary}
                returnKeyType="search"
                onSubmitEditing={generate}
                autoFocus
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.generateBtn, (!query.trim() || loading) && { opacity: 0.5 }]}
                onPress={generate}
                disabled={!query.trim() || loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="sparkles-outline" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.loadingText}>Asking AI…</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="warning-outline" size={16} color={colors.warning} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Editable result */}
            {draft && (
              <DraftEditor
                draft={draft}
                color={color}
                onChange={(patch) => setDraft((prev) => prev ? { ...prev, ...patch } : prev)}
                onRegenerate={generate}
                loading={loading}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual Create Modal
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseFormModal({
  initialDraft,
  existingId,
  existingCreatedAt,
  onClose,
  onSave,
}: {
  initialDraft: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>;
  existingId?: string;
  existingCreatedAt?: string;
  onClose: () => void;
  onSave: (exercise: Exercise) => Promise<void>;
}) {
  const { top } = useSafeAreaInsets();
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);

  const color = CATEGORY_COLORS[draft.category];
  const isEditing = !!existingId;

  const handleSave = async () => {
    if (!draft.name.trim()) {
      Alert.alert('Name required', 'Please enter an exercise name.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await onSave({
        id: existingId ?? generateId(),
        ...draft,
        name: draft.name.trim(),
        createdAt: existingCreatedAt ?? now,
        updatedAt: now,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: top }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.modalNav}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.navCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{isEditing ? 'Edit Exercise' : 'New Exercise'}</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={[styles.navSave, saving && { opacity: 0.5 }]}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <DraftEditor
              draft={draft}
              color={color}
              onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared editable draft editor
// ─────────────────────────────────────────────────────────────────────────────

type DraftPatch = Partial<Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>>;

function DraftEditor({
  draft,
  color,
  onChange,
  onRegenerate,
  loading,
}: {
  draft: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>;
  color: string;
  onChange: (patch: DraftPatch) => void;
  onRegenerate?: () => void;
  loading?: boolean;
}) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);

  const toggleMuscle = (group: MuscleGroup, isPrimary: boolean) => {
    const existing = draft.muscles.find((m) => m.group === group);
    let next: TargetedMuscle[];
    if (!existing) {
      next = [...draft.muscles, { group, isPrimary }];
    } else if (existing.isPrimary === isPrimary) {
      // deselect
      next = draft.muscles.filter((m) => m.group !== group);
    } else {
      // toggle primary/secondary
      next = draft.muscles.map((m) => m.group === group ? { ...m, isPrimary } : m);
    }
    onChange({ muscles: next });
  };

  return (
    <View style={styles.draftEditor}>
      {/* Name */}
      <FormSection label="NAME">
        <TextInput
          style={styles.nameField}
          value={draft.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Exercise name"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
          autoCapitalize="words"
        />
      </FormSection>

      {/* Description */}
      <FormSection label="DESCRIPTION">
        <TextInput
          style={styles.descField}
          value={draft.description ?? ''}
          onChangeText={(description) => onChange({ description })}
          placeholder="Brief description (optional)"
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={2}
          returnKeyType="done"
          blurOnSubmit
        />
      </FormSection>

      {/* Video link */}
      <FormSection label="VIDEO LINK">
        <TextInput
          style={styles.nameField}
          value={draft.videoUrl ?? ''}
          onChangeText={(v) => onChange({ videoUrl: v.trim() || undefined })}
          placeholder="YouTube URL (optional)"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {!!draft.videoUrl && <YoutubePlayer url={draft.videoUrl} />}
      </FormSection>
      <FormSection label="CATEGORY">
        <View style={styles.toggleGrid}>
          {ALL_CATEGORIES.map((cat) => {
            const active = draft.category === cat;
            const c = CATEGORY_COLORS[cat];
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.toggleChip,
                  active
                    ? { borderColor: c, backgroundColor: `${c}22` }
                    : { borderColor: colors.border },
                ]}
                onPress={() => onChange({ category: cat })}
                activeOpacity={0.7}
              >
                <Text style={[styles.toggleChipText, active && { color: c }]}>
                  {CATEGORY_LABELS[cat]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FormSection>

      {/* Rep mode */}
      <FormSection label="REP MODE">
        <View style={styles.toggleRow}>
          {ALL_REP_MODES.map(({ value, label }) => {
            const active = draft.repMode === value;
            return (
              <TouchableOpacity
                key={value}
                style={[
                  styles.toggleChip,
                  styles.toggleChipFlex,
                  active
                    ? { borderColor: color, backgroundColor: `${color}22` }
                    : { borderColor: colors.border },
                ]}
                onPress={() => onChange({ repMode: value })}
                activeOpacity={0.7}
              >
                <Text style={[styles.toggleChipText, active && { color }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FormSection>

      {/* Muscles */}
      <FormSection label="TARGETED MUSCLES">
        <Text style={styles.muscleHint}>
          Tap once → <Text style={{ color }}>Primary</Text>{'  '}
          Tap again → <Text style={{ color: colors.textSecondary }}>Secondary</Text>{'  '}
          Tap again → off
        </Text>
        <View style={styles.muscleGrid}>
          {ALL_MUSCLE_GROUPS.map((group) => {
            const existing = draft.muscles.find((m) => m.group === group);
            const isPrimary = existing?.isPrimary === true;
            const isSecondary = existing && !existing.isPrimary;
            return (
              <TouchableOpacity
                key={group}
                style={[
                  styles.muscleChip,
                  isPrimary && { borderColor: color, backgroundColor: `${color}28` },
                  isSecondary && { borderColor: colors.textTertiary },
                ]}
                onPress={() => {
                  if (!existing) {
                    toggleMuscle(group, true);
                  } else if (existing.isPrimary) {
                    toggleMuscle(group, false);
                  } else {
                    toggleMuscle(group, false); // deselect
                  }
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.muscleChipText,
                    isPrimary && { color },
                    isSecondary && { color: colors.textSecondary },
                  ]}
                >
                  {MUSCLE_LABELS[group]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {draft.muscles.length > 0 && (
          <View style={{ marginTop: Spacing.md }}>
            <MuscleDiagram muscles={draft.muscles} color={color} />
          </View>
        )}
      </FormSection>

      {/* Regenerate */}
      {onRegenerate && (
        <TouchableOpacity
          style={[styles.regenBtn, (loading) && { opacity: 0.5 }]}
          onPress={onRegenerate}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Ionicons name="refresh-outline" size={16} color={colors.accent} />
          )}
          <Text style={styles.regenText}>Regenerate with AI</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function FormSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  return (
    <View style={styles.formSection}>
      <Text style={styles.formLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },

    header: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.sm,
    },
    title: { ...Typography.h1, color: c.textPrimary },
    subtitle: { ...Typography.caption, color: c.textTertiary },

    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.md,
      marginBottom: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      gap: Spacing.sm,
    },
    searchInput: { flex: 1, ...Typography.body, color: c.textPrimary },

    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.md,
    },
    filterToggleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: Spacing.sm,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: c.border,
    },
    filterToggleBtnActive: { borderColor: c.accent, backgroundColor: `${c.accent}15` },
    filterToggleText: { ...Typography.captionBold, color: c.textSecondary },
    filterToggleTextActive: { color: c.accent },
    clearFiltersText: { ...Typography.captionBold, color: c.textTertiary },
    filterPanel: {
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.md,
      gap: Spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      marginBottom: Spacing.md,
    },
    filterSectionLabel: { ...Typography.tiny, color: c.textTertiary, letterSpacing: 1.2 },
    filterChipsRow: { flexDirection: 'row', gap: 8, paddingBottom: 2 },
    filterChip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.full,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    filterChipText: { ...Typography.tiny, color: c.textTertiary, fontWeight: '600' },

    list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

    emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
    emptyTitle: { ...Typography.h2, color: c.textSecondary },
    emptySubtitle: {
      ...Typography.body,
      color: c.textTertiary,
      textAlign: 'center',
      lineHeight: 22,
    },

    fab: {
      position: 'absolute',
      right: Spacing.lg,
      bottom: Spacing.xl,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 16,
      elevation: 10,
    },

    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    chooseSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      padding: Spacing.lg,
      paddingBottom: 40,
      gap: Spacing.md,
    },
    chooseTitle: { ...Typography.h2, color: c.textPrimary, marginBottom: 4 },
    chooseOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      backgroundColor: c.surfaceElevated,
      borderRadius: Radius.lg,
      padding: Spacing.md,
    },
    chooseIcon: {
      width: 44,
      height: 44,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chooseText: { flex: 1 },
    chooseOptionTitle: { ...Typography.bodyBold, color: c.textPrimary },
    chooseOptionSub: { ...Typography.caption, color: c.textTertiary },

    // Modal
    modalContainer: { flex: 1, backgroundColor: c.background },
    modalNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: { ...Typography.bodyBold, color: c.textPrimary },
    navCancel: { ...Typography.body, color: c.textSecondary },
    navSave: { ...Typography.bodyBold, color: c.accent },
    modalContent: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 60 },

    // AI search
    aiSearchRow: { flexDirection: 'row', gap: Spacing.sm },
    aiSearchInput: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      ...Typography.body,
      color: c.textPrimary,
    },
    generateBtn: {
      backgroundColor: c.accent,
      borderRadius: Radius.lg,
      width: 50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
    loadingText: { ...Typography.body, color: c.textSecondary },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.surfaceElevated,
      borderRadius: Radius.md,
      padding: Spacing.md,
    },
    errorText: { ...Typography.caption, color: c.warning, flex: 1 },

    // Draft editor
    draftEditor: { gap: Spacing.lg },
    formSection: { gap: Spacing.sm },
    formLabel: { ...Typography.tiny, color: c.textTertiary, letterSpacing: 1.2 },
    nameField: {
      backgroundColor: c.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      ...Typography.bodyBold,
      color: c.textPrimary,
    },
    descField: {
      backgroundColor: c.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      ...Typography.body,
      color: c.textPrimary,
      minHeight: 72,
      textAlignVertical: 'top',
    },
    toggleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    toggleRow: { flexDirection: 'row', gap: 8 },
    toggleChip: {
      borderWidth: 1,
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.md,
      paddingVertical: 7,
    },
    toggleChipFlex: { flex: 1, alignItems: 'center' },
    toggleChipText: { ...Typography.captionBold, color: c.textTertiary },
    muscleHint: { ...Typography.tiny, color: c.textTertiary, marginBottom: 4 },
    muscleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    muscleChip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.full,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    muscleChipText: { ...Typography.tiny, color: c.textTertiary, fontWeight: '600' },
    regenBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      borderWidth: 1,
      borderColor: c.accent,
      borderRadius: Radius.full,
      paddingVertical: 12,
      marginTop: Spacing.sm,
    },
    regenText: { ...Typography.captionBold, color: c.accent },
    saveExerciseBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      backgroundColor: c.accent,
      borderRadius: Radius.full,
      paddingVertical: 16,
      marginTop: Spacing.md,
      shadowColor: c.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    },
    saveExerciseBtnText: { ...Typography.bodyBold, color: '#fff' },
  });
}
