import React, { useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { Spacing, Radius, Typography } from '../theme';
import SettingsScreen from './SettingsScreen';
import ImportScreen from './ImportScreen';

const GOALS = [
  { id: 'weight_loss', label: 'Lose weight', icon: 'trending-down-outline' as const },
  { id: 'muscle_gain', label: 'Build muscle', icon: 'barbell-outline' as const },
  { id: 'endurance', label: 'Endurance', icon: 'pulse-outline' as const },
  { id: 'strength', label: 'Strength', icon: 'flame-outline' as const },
  { id: 'flexibility', label: 'Flexibility', icon: 'body-outline' as const },
  { id: 'general', label: 'Stay active', icon: 'heart-outline' as const },
];

export default function ProfileScreen() {
  const { profile, updateProfile, colors } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const { top } = useSafeAreaInsets();

  const toggleGoal = (id: string) => {
    const goals = profile.goals.includes(id)
      ? profile.goals.filter((g) => g !== id)
      : [...profile.goals, id];
    updateProfile({ goals });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: top + Spacing.sm, borderBottomColor: colors.border }]}>
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
            </View>

            <View style={styles.fieldRow}>
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
          </View>

          {/* Goals */}
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>OBJECTIVES</Text>
            <View style={styles.goalsGrid}>
              {GOALS.map((goal) => {
                const active = profile.goals.includes(goal.id);
                return (
                  <TouchableOpacity
                    key={goal.id}
                    style={[
                      styles.goalChip,
                      { borderColor: active ? colors.accent : colors.border },
                      active && { backgroundColor: colors.accentDim },
                    ]}
                    onPress={() => toggleGoal(goal.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={goal.icon}
                      size={14}
                      color={active ? colors.accent : colors.textSecondary}
                    />
                    <Text style={[styles.goalLabel, { color: active ? colors.accent : colors.textSecondary }]}>
                      {goal.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Migrate data from the legacy app */}
          <TouchableOpacity
            style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setShowImport(true)}
            activeOpacity={0.7}
          >
            <View style={styles.migrateRow}>
              <Ionicons name="cloud-download-outline" size={18} color={colors.accent} />
              <View style={styles.migrateText}>
                <Text style={[styles.migrateTitle, { color: colors.textPrimary }]}>Migrate data</Text>
                <Text style={[styles.migrateHint, { color: colors.textTertiary }]}>
                  Import from a previous KBC export file
                </Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={16} color={colors.textTertiary} />
            </View>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showSettings} animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <SettingsScreen onClose={() => setShowSettings(false)} />
      </Modal>

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
  goalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    padding: Spacing.md,
    paddingTop: 0,
  },
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  goalLabel: { ...Typography.captionBold },
  migrateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  migrateText: { flex: 1 },
  migrateTitle: { ...Typography.bodyBold },
  migrateHint: { ...Typography.caption },
});
