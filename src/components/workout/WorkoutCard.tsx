import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WorkoutTemplate } from '../../models';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import { blockColor, blockDim, blockLabel, getBlockDisplayLabel, getBlockDisplayColor, getBlockDisplayDim } from '../../utils/helpers';
import SwipeableRow from '../common/SwipeableRow';
import { useSettings } from '../../context/SettingsContext';

interface Props {
  template: WorkoutTemplate;
  isActive: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
  onDuplicate: () => void;
  onToggleArchive: () => void;
}

export default function WorkoutCard({ template, isActive, onEdit, onDelete, onSelect, onDuplicate, onToggleArchive }: Props) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const isArchived = !!template.archived;
  const summary = template.blocks
    .filter((b) => b.items.length > 0)
    .map((b) =>
      b.type === 'emom'
        ? `${b.items.length} ex · ${b.emomMinutes} min EMOM`
        : `${b.items.length} ${getBlockDisplayLabel(b).toLowerCase()}`
    )
    .join('  ·  ');

  return (
    <SwipeableRow onDelete={onDelete} style={{ marginBottom: Spacing.sm }}>
      <TouchableOpacity
        style={[styles.card, isActive && styles.cardActive, isArchived && styles.cardArchived]}
        onPress={onEdit}
        activeOpacity={0.8}
      >
        {/* Main content */}
        <View style={styles.content}>
        {/* Name */}
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {template.name}
          </Text>
          <TouchableOpacity
            onPress={onToggleArchive}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.iconBtn}
          >
            <Ionicons
              name={isArchived ? 'archive-outline' : 'cube-outline'}
              size={14}
              color={colors.textTertiary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDuplicate}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.iconBtn}
          >
            <Ionicons name="copy-outline" size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.summary} numberOfLines={2}>
          {summary || 'Empty workout'}
        </Text>

        <View style={styles.blocks}>
          {template.blocks
            .filter((b) => b.items.length > 0)
            .map((b) => (
              <View key={b.id} style={[styles.blockBadge, { backgroundColor: getBlockDisplayDim(b) }]}>
                <Text style={[styles.blockBadgeText, { color: getBlockDisplayColor(b) }]}>
                  {getBlockDisplayLabel(b)}
                </Text>
              </View>
            ))}
        </View>

        <TouchableOpacity
          onPress={onSelect}
          activeOpacity={0.75}
          style={[styles.selectBtn, isActive && styles.selectBtnActive]}
        >
          <Ionicons
            name={isActive ? 'checkmark-circle' : 'play-circle-outline'}
            size={16}
            color={isActive ? colors.success : colors.accent}
          />
          <Text style={[styles.selectBtnText, isActive && { color: colors.success }]}>
            {isActive ? 'Selected' : 'Select for Execution'}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </SwipeableRow>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      padding: Spacing.md,
      gap: Spacing.md,
    },
    cardActive: {
      borderColor: c.accent,
      backgroundColor: c.surfaceElevated,
    },
    cardArchived: {
      opacity: 0.55,
    },
    content: {
      flex: 1,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.xs,
    },
    name: {
      ...Typography.h3,
      color: c.textPrimary,
      flex: 1,
    },
    duplicateBtn: {
      padding: 4,
    },
    iconBtn: {
      padding: 4,
    },
    summary: {
      ...Typography.caption,
      color: c.textTertiary,
      marginBottom: Spacing.md,
      lineHeight: 18,
    },
    blocks: {
      flexDirection: 'row',
      gap: Spacing.xs,
      marginBottom: Spacing.md,
      flexWrap: 'wrap',
    },
    blockBadge: {
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
    },
    blockBadgeText: {
      ...Typography.tiny,
      letterSpacing: 0.5,
    },
    selectBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      alignSelf: 'flex-start',
    },
    selectBtnActive: {
      borderColor: c.success,
      backgroundColor: c.successDim,
    },
    selectBtnText: {
      ...Typography.captionBold,
      color: c.accent,
    },
  });
}
