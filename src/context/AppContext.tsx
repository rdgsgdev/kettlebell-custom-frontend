import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { WorkoutTemplate, WorkoutLog, Exercise } from '../models';
import * as Storage from '../storage';

interface AppContextValue {
  templates: WorkoutTemplate[];
  logs: WorkoutLog[];
  exercises: Exercise[];
  activeWorkoutIds: string[];
  isLoading: boolean;
  saveTemplate: (template: WorkoutTemplate) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  saveLog: (log: WorkoutLog) => Promise<void>;
  updateLog: (log: WorkoutLog) => Promise<void>;
  deleteLog: (id: string) => Promise<void>;
  toggleActiveWorkout: (id: string) => void;
  saveExercise: (exercise: Exercise) => Promise<void>;
  deleteExercise: (id: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [activeWorkoutIds, setActiveWorkoutIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [t, l, a, e] = await Promise.all([
        Storage.loadTemplates(),
        Storage.loadLogs(),
        Storage.getActiveWorkoutIds(),
        Storage.loadExercises(),
      ]);
      setTemplates(t);
      setLogs(l);
      setActiveWorkoutIds(a);
      setExercises(e);
      setIsLoading(false);
    })();
  }, []);

  const saveTemplate = useCallback(
    async (template: WorkoutTemplate) => {
      const updated = templates.some((t) => t.id === template.id)
        ? templates.map((t) => (t.id === template.id ? template : t))
        : [...templates, template];
      setTemplates(updated);
      await Storage.saveTemplates(updated);
    },
    [templates],
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      const updated = templates.filter((t) => t.id !== id);
      setTemplates(updated);
      await Storage.saveTemplates(updated);
    },
    [templates],
  );

  const saveLog = useCallback(
    async (log: WorkoutLog) => {
      const updated = [log, ...logs];
      setLogs(updated);
      await Storage.saveLogs(updated);
    },
    [logs],
  );

  const updateLog = useCallback(
    async (log: WorkoutLog) => {
      const updated = logs.map((l) => (l.id === log.id ? log : l));
      setLogs(updated);
      await Storage.saveLogs(updated);
    },
    [logs],
  );

  const deleteLog = useCallback(
    async (id: string) => {
      const updated = logs.filter((l) => l.id !== id);
      setLogs(updated);
      await Storage.saveLogs(updated);
    },
    [logs],
  );

  const toggleActiveWorkout = useCallback((id: string) => {
    setActiveWorkoutIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      Storage.persistActiveWorkoutIds(next);
      return next;
    });
  }, []);

  const saveExercise = useCallback(
    async (exercise: Exercise) => {
      setExercises((prev) => {
        const updated = prev.some((e) => e.id === exercise.id)
          ? prev.map((e) => (e.id === exercise.id ? exercise : e))
          : [exercise, ...prev];
        Storage.saveExercises(updated);
        return updated;
      });
    },
    [],
  );

  const deleteExercise = useCallback(async (id: string) => {
    setExercises((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      Storage.saveExercises(updated);
      return updated;
    });
  }, []);

  const value = useMemo(
    () => ({
      templates,
      logs,
      exercises,
      activeWorkoutIds,
      isLoading,
      saveTemplate,
      deleteTemplate,
      saveLog,
      updateLog,
      deleteLog,
      toggleActiveWorkout,
      saveExercise,
      deleteExercise,
    }),
    [
      templates,
      logs,
      exercises,
      activeWorkoutIds,
      isLoading,
      saveTemplate,
      deleteTemplate,
      saveLog,
      updateLog,
      deleteLog,
      toggleActiveWorkout,
      saveExercise,
      deleteExercise,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
};
