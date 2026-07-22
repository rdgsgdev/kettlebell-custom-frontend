import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { WorkoutTemplate } from '../models';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { useSettings } from '../context/SettingsContext';
import WorkoutCard from '../components/workout/WorkoutCard';
import WorkoutEditor from '../components/workout/WorkoutEditor';
import EmptyState from '../components/common/EmptyState';
import { generateId } from '../utils/helpers';

export default function WorkoutScreen() {
  const { templates, saveTemplate, deleteTemplate, toggleActiveWorkout, activeWorkoutIds } =
    useAppContext();
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const [editingTemplate, setEditingTemplate] = useState<WorkoutTemplate | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const activeTemplates = templates.filter((t) => !t.archived);
  const archivedTemplates = templates.filter((t) => t.archived);

  const handleCreate = () => {
    const newTemplate: WorkoutTemplate = {
      id: generateId(),
      name: 'New Workout',
      blocks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingTemplate(newTemplate);
  };

  const handleEdit = (template: WorkoutTemplate) => {
    setEditingTemplate(template);
  };

  const handleSave = async (template: WorkoutTemplate) => {
    await saveTemplate({ ...template, updatedAt: new Date().toISOString() });
    setEditingTemplate(null);
  };

  const handleDelete = (id: string) => {
    deleteTemplate(id);
    if (activeWorkoutIds.includes(id)) toggleActiveWorkout(id);
  };

  const handleToggleArchive = (template: WorkoutTemplate) => {
    saveTemplate({ ...template, archived: !template.archived, updatedAt: new Date().toISOString() });
    if (template.archived && activeWorkoutIds.includes(template.id)) {
      // un-archiving: keep selection as-is
    } else if (!template.archived && activeWorkoutIds.includes(template.id)) {
      // archiving an active workout: deselect it so it doesn't run
      toggleActiveWorkout(template.id);
    }
  };

  const handleDuplicate = (template: WorkoutTemplate) => {
    const copy: WorkoutTemplate = {
      ...template,
      id: generateId(),
      name: `${template.name} (copy)`,
      blocks: template.blocks.map((block) => ({
        ...block,
        id: generateId(),
        items: block.items.map((item) => ({ ...item, id: generateId() })),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveTemplate(copy);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Workouts</Text>
        <Text style={[styles.subtitle, { color: colors.textTertiary }]}>{activeTemplates.length} active{archivedTemplates.length > 0 ? ` · ${archivedTemplates.length} archived` : ''}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {activeTemplates.map((t) => (
          <WorkoutCard
            key={t.id}
            template={t}
            isActive={activeWorkoutIds.includes(t.id)}
            onEdit={() => handleEdit(t)}
            onDelete={() => handleDelete(t.id)}
            onSelect={() => toggleActiveWorkout(t.id)}
            onDuplicate={() => handleDuplicate(t)}
            onToggleArchive={() => handleToggleArchive(t)}
          />
        ))}

        {activeTemplates.length === 0 && archivedTemplates.length === 0 && (
          <EmptyState
            icon="barbell-outline"
            title="No workouts yet"
            subtitle={'Tap the + button below\nto create your first workout'}
          />
        )}

        {/* Collapsible archived section */}
        {archivedTemplates.length > 0 && (
          <View style={styles.archivedSection}>
            <TouchableOpacity
              style={styles.archivedHeader}
              onPress={() => setShowArchived((v) => !v)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={showArchived ? 'chevron-down' : 'chevron-forward'}
                size={14}
                color={colors.textTertiary}
              />
              <Text style={[styles.archivedHeaderText, { color: colors.textTertiary }]}>
                ARCHIVED ({archivedTemplates.length})
              </Text>
            </TouchableOpacity>
            {showArchived &&
              archivedTemplates.map((t) => (
                <WorkoutCard
                  key={t.id}
                  template={t}
                  isActive={activeWorkoutIds.includes(t.id)}
                  onEdit={() => handleEdit(t)}
                  onDelete={() => handleDelete(t.id)}
                  onSelect={() => toggleActiveWorkout(t.id)}
                  onDuplicate={() => handleDuplicate(t)}
                  onToggleArchive={() => handleToggleArchive(t)}
                />
              ))}
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={handleCreate} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={editingTemplate !== null}
        animationType="slide"
        onRequestClose={() => setEditingTemplate(null)}
      >
        {editingTemplate && (
          <WorkoutEditor
            template={editingTemplate}
            onSave={handleSave}
            onCancel={() => setEditingTemplate(null)}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.sm,
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    title: {
      ...Typography.h1,
      color: c.textPrimary,
    },
    subtitle: {
      ...Typography.caption,
      color: c.textTertiary,
    },
    list: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: 100,
    },
    fab: {
      position: 'absolute',
      bottom: Spacing.xl,
      right: Spacing.lg,
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
    archivedSection: {
      marginTop: Spacing.lg,
    },
    archivedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: Spacing.sm,
    },
    archivedHeaderText: {
      ...Typography.tiny,
      letterSpacing: 1,
      fontWeight: '600',
    },
  });
}
