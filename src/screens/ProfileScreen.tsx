import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { useAppContext } from '../context/AppContext';
import { Objective } from '../models';
import { Colors, Spacing, Radius, Typography } from '../theme';
import SettingsScreen from './SettingsScreen';
import CoachChat from '../components/coach/CoachChat';
import ObjectiveCard from '../components/profile/ObjectiveCard';
import AddObjectiveModal from '../components/profile/AddObjectiveModal';
import { computeProgress } from '../utils/objectives';
import {
  getLatestBodyMetrics,
  isHealthAvailable,
} from '../services/health';

export default function ProfileScreen() {
  const { profile, updateProfile, colors } = useSettings();
  const { logs } = useAppContext();
  const [showSettings, setShowSettings] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [showAddObjective, setShowAddObjective] = useState(false);
  // Objective currently being edited (null = create mode). Held outside the
  // modal so the same AddObjectiveModal instance handles both flows.
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Keep the freshest profile for async Health merges that run after a focus.
  // (updateProfile closes over `profile`, which can be stale inside the focus
  // callback; this ref always points at the latest snapshot.)
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const addObjective = (objective: Objective) => {
    updateProfile({ objectives: [...profile.objectives, objective] });
  };

  const updateObjective = (objective: Objective) => {
    updateProfile({
      objectives: profile.objectives.map((o) => (o.id === objective.id ? objective : o)),
    });
    setShowAddObjective(false);
    setEditingObjective(null);
  };

  const deleteObjective = (id: string) => {
    updateProfile({ objectives: profile.objectives.filter((o) => o.id !== id) });
  };

  const openEditor = (objective: Objective) => {
    setEditingObjective(objective);
    setShowAddObjective(true);
  };

  const openCreator = () => {
    setEditingObjective(null);
    setShowAddObjective(true);
  };

  /**
   * Pull the latest weight + body fat from Apple Health and apply only the
   * readings newer than what's stored. Manual edits (which don't set the
   * `*UpdatedAt` timestamps) are never overwritten by an older Health sample.
   */
  const pullFromHealth = useCallback(async () => {
    if (!isHealthAvailable()) return;
    setHealthLoading(true);
    try {
      const metrics = await getLatestBodyMetrics();
      const current = profileRef.current;
      const patch: Partial<typeof profile> = {};

      if (metrics.weightKg != null) {
        const storedAt = current.weightKgUpdatedAt;
        if (!storedAt || !metrics.weightDate || metrics.weightDate >= storedAt) {
          patch.weightKg = metrics.weightKg;
          if (metrics.weightDate) patch.weightKgUpdatedAt = metrics.weightDate;
        }
      }
      if (metrics.bodyFatPct != null) {
        const storedAt = current.bodyFatPctUpdatedAt;
        if (!storedAt || !metrics.bodyFatDate || metrics.bodyFatDate >= storedAt) {
          patch.bodyFatPct = metrics.bodyFatPct;
          if (metrics.bodyFatDate) patch.bodyFatPctUpdatedAt = metrics.bodyFatDate;
        }
      }
      if (Object.keys(patch).length > 0) {
        await updateProfile(patch);
      }
    } finally {
      setHealthLoading(false);
    }
  }, [updateProfile]);

  // Auto-fetch once when the tab gains focus (iOS only). Skipped on subsequent
  // re-focuses within the same session to avoid surprising overwrites; the user
  // can always tap the refresh button to re-pull.
  useFocusEffect(
    useCallback(() => {
      pullFromHealth();
    }, [pullFromHealth]),
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header — matches the alignment of Exercises/Workouts/Progress tabs */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Profile</Text>
          <TouchableOpacity
            onPress={() => setShowSettings(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar placeholder */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatar, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
              <Text style={[styles.avatarText, { color: colors.accent }]}>
                {profile.name ? profile.name.charAt(0).toUpperCase() : '?'}
              </Text>
            </View>
          </View>

          {/* Personal Info */}
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>PERSONAL INFO</Text>

            <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="person-outline" size={16} color={colors.textTertiary} style={styles.fieldIcon} />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary }]}
                value={profile.name}
                onChangeText={(name) => updateProfile({ name })}
                placeholder="Your name"
                placeholderTextColor={colors.textTertiary}
                returnKeyType="done"
                autoCorrect={false}
              />
            </View>

            <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="calendar-outline" size={16} color={colors.textTertiary} style={styles.fieldIcon} />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Birth year</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary }]}
                value={profile.birthYear ? String(profile.birthYear) : ''}
                onChangeText={(v) => {
                  const n = parseInt(v, 10);
                  updateProfile({ birthYear: isNaN(n) ? undefined : n });
                }}
                placeholder="e.g. 1990"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>

            <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="scale-outline" size={16} color={colors.textTertiary} style={styles.fieldIcon} />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Weight</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary }]}
                value={profile.weightKg ? String(profile.weightKg) : ''}
                onChangeText={(v) => {
                  const n = parseFloat(v);
                  updateProfile({ weightKg: isNaN(n) ? undefined : n });
                }}
                placeholder="kg"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
              <Text style={[styles.fieldUnit, { color: colors.textTertiary }]}>kg</Text>
              <HealthRefreshButton
                loading={healthLoading}
                color={colors.accent}
                textTertiary={colors.textTertiary}
                onPress={pullFromHealth}
              />
            </View>

            <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="resize-outline" size={16} color={colors.textTertiary} style={styles.fieldIcon} />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Height</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary }]}
                value={profile.heightCm ? String(profile.heightCm) : ''}
                onChangeText={(v) => {
                  const n = parseFloat(v);
                  updateProfile({ heightCm: isNaN(n) ? undefined : n });
                }}
                placeholder="cm"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
              <Text style={[styles.fieldUnit, { color: colors.textTertiary }]}>cm</Text>
            </View>

            <View style={styles.fieldRow}>
              <Ionicons name="body-outline" size={16} color={colors.textTertiary} style={styles.fieldIcon} />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Body fat</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary }]}
                value={profile.bodyFatPct != null ? String(profile.bodyFatPct) : ''}
                onChangeText={(v) => {
                  const n = parseFloat(v);
                  updateProfile({ bodyFatPct: isNaN(n) ? undefined : n });
                }}
                placeholder="%"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
              <Text style={[styles.fieldUnit, { color: colors.textTertiary }]}>%</Text>
              <HealthRefreshButton
                loading={healthLoading}
                color={colors.accent}
                textTertiary={colors.textTertiary}
                onPress={pullFromHealth}
              />
            </View>
          </View>

          {/* Objectives */}
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionHeaderLabel, { color: colors.textTertiary }]}>OBJECTIVES</Text>
              <TouchableOpacity
                onPress={openCreator}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.addObjectiveBtn}
              >
                <Ionicons name="add" size={20} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {profile.objectives.length === 0 ? (
              <View style={styles.emptyObjectives}>
                <TouchableOpacity
                  style={[styles.emptyAddBtn, { borderColor: colors.accent, backgroundColor: colors.accentDim }]}
                  onPress={openCreator}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-outline" size={16} color={colors.accent} />
                  <Text style={[styles.emptyAddText, { color: colors.accent }]}>Add an objective</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.objectivesList}>
                {profile.objectives.map((objective) => (
                  <ObjectiveCard
                    key={objective.id}
                    objective={objective}
                    progress={computeProgress(objective, { logs, profile })}
                    onDelete={deleteObjective}
                    onEdit={openEditor}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Migrate data lives in Settings → General */}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* AI Coach FAB — bottom-right, aligned with the + buttons on other tabs */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: colors.accent,
            shadowColor: colors.accent,
          },
        ]}
        onPress={() => setShowCoach(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={24} color="#fff" />
      </TouchableOpacity>

      <Modal visible={showSettings} animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <SettingsScreen onClose={() => setShowSettings(false)} />
      </Modal>

      <AddObjectiveModal
        visible={showAddObjective}
        editingObjective={editingObjective ?? undefined}
        onClose={() => {
          setShowAddObjective(false);
          setEditingObjective(null);
        }}
        onCreate={addObjective}
        onUpdate={updateObjective}
      />

      <CoachChat visible={showCoach} onClose={() => setShowCoach(false)} />
    </SafeAreaView>
  );
}

/**
 * Small "pull from Apple Health" affordance shown at the end of the Weight and
 * Body fat rows. On non-iOS platforms it renders nothing (HealthKit is iOS-only).
 */
function HealthRefreshButton({
  loading,
  color,
  textTertiary,
  onPress,
}: {
  loading: boolean;
  color: string;
  textTertiary: string;
  onPress: () => void;
}) {
  if (!isHealthAvailable()) return null;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
      style={healthRefreshStyles.btn}
      accessibilityLabel="Pull from Apple Health"
    >
      {loading ? (
        <ActivityIndicator size="small" color={textTertiary} />
      ) : (
        <Ionicons name="heart-outline" size={16} color={color} />
      )}
    </TouchableOpacity>
  );
}

const healthRefreshStyles = StyleSheet.create({
  btn: {
    marginLeft: 2,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: { ...Typography.h1 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 60 },
  avatarSection: { alignItems: 'center', paddingVertical: Spacing.md },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 32, fontWeight: '700' },
  sectionCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  sectionLabel: {
    ...Typography.tiny,
    letterSpacing: 1.2,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  fieldIcon: { width: 18 },
  fieldLabel: { ...Typography.body, width: 80 },
  fieldInput: { flex: 1, ...Typography.body, textAlign: 'right' },
  fieldUnit: { ...Typography.caption, marginLeft: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  sectionHeaderLabel: {
    ...Typography.tiny,
    letterSpacing: 1.2,
  },
  addObjectiveBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -4,
  },
  objectivesList: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  emptyObjectives: {
    padding: Spacing.md,
    paddingTop: Spacing.sm,
    alignItems: 'center',
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  emptyAddText: { ...Typography.captionBold },
  fab: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
});
