import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../context/AppContext';
import { Exercise, ExerciseCategory, MuscleGroup, RepMode } from '../../models';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import { useSettings } from '../../context/SettingsContext';
import { CATEGORY_COLORS, CATEGORY_LABELS, MUSCLE_LABELS, ALL_MUSCLE_GROUPS } from '../../utils/exercises';

const ALL_CATEGORIES: ExerciseCategory[] = [
  'strength', 'cardio', 'flexibility', 'balance',
];
const ALL_REP_MODES: { value: RepMode; label: string }[] = [
  { value: 'bilateral', label: 'Bilateral' },
  { value: 'unilateral', label: 'L / R' },
  { value: 'unilateral-fr', label: 'F / R' },
];

interface Props {
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
  currentName?: string;
}

export default function ExercisePickerModal({ onSelect, onClose, currentName }: Props) {
  const { exercises } = useAppContext();
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const [search, setSearch] = useState(currentName ?? '');
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

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Nav */}
        <View style={styles.nav}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.navCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Exercise Library</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises…"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            autoFocus
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

        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
          renderItem={({ item }) => {
            const color = CATEGORY_COLORS[item.category];
            const primary = item.muscles.filter((m) => m.isPrimary).slice(0, 2);
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => onSelect(item)}
                activeOpacity={0.8}
              >
                <View style={[styles.dot, { backgroundColor: `${color}28`, borderColor: color }]}>
                  <Text style={[styles.dotText, { color }]}>
                    {CATEGORY_LABELS[item.category][0]}
                  </Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  {primary.length > 0 && (
                    <Text style={styles.rowMuscles} numberOfLines={1}>
                      {primary.map((m) => MUSCLE_LABELS[m.group]).join(' · ')}
                    </Text>
                  )}
                </View>
                <View style={styles.rowMeta}>
                  <Text style={styles.repMode}>
                    {item.repMode === 'unilateral-fr'
                      ? 'F/R'
                      : item.repMode === 'unilateral'
                      ? 'L/R'
                      : 'Both'}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {exercises.length === 0
                  ? 'Your exercise library is empty.\nGo to the Exercises tab to create some.'
                  : 'No exercises match your search or filters.'}
              </Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 60,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  navCancel: { ...Typography.body, color: c.textSecondary, width: 60 },
  navTitle: { ...Typography.bodyBold, color: c.textPrimary },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    margin: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.sm,
  },
  searchInput: { flex: 1, ...Typography.body, color: c.textPrimary },
  list: { paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    backgroundColor: c.background,
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { ...Typography.captionBold },
  rowText: { flex: 1 },
  rowName: { ...Typography.bodyBold, color: c.textPrimary },
  rowMuscles: { ...Typography.caption, color: c.textTertiary },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  repMode: { ...Typography.tiny, color: c.textTertiary, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyText: {
    ...Typography.body,
    color: c.textTertiary,
    textAlign: 'center',
    lineHeight: 22,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
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
    marginBottom: Spacing.xs,
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
  });
}
