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
        <Text style={[styles.subtitle, { color: colors.textTertiary }]}>{templates.length} template{templates.length !== 1 ? 's' : ''}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {templates.length === 0 ? (
          <EmptyState
            icon="barbell-outline"
            title="No workouts yet"
            subtitle={'Tap the + button below\nto create your first workout'}
          />
        ) : (
          templates.map((t) => (
            <WorkoutCard
              key={t.id}
              template={t}
              isActive={activeWorkoutIds.includes(t.id)}
              onEdit={() => handleEdit(t)}
              onDelete={() => handleDelete(t.id)}
              onSelect={() => toggleActiveWorkout(t.id)}
              onDuplicate={() => handleDuplicate(t)}
            />
          ))
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
  });
}
