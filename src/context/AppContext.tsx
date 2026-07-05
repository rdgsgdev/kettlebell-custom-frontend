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
  /** Re-read all collections from the local cache. Call after a pull/import
   *  so the screens reflect freshly synced data without an app restart. */
  reloadFromCache: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

// Always keep logs sorted newest-first by startedAt so the History list is
// consistent across platforms (native cache and Supabase both sort, but this
// guarantees the order for any in-memory optimistic update too).
const sortByStartedAtDesc = (logs: WorkoutLog[]) =>
  [...logs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [activeWorkoutIds, setActiveWorkoutIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load every collection from the local cache into state.
  const reloadFromCache = useCallback(async () => {
    const [t, l, a, e] = await Promise.all([
      Storage.loadTemplates(),
      Storage.loadLogs(),
      Storage.getActiveWorkoutIds(),
      Storage.loadExercises(),
    ]);
    setTemplates(t);
    setLogs(sortByStartedAtDesc(l));
    setActiveWorkoutIds(a);
    setExercises(e);
  }, []);

  useEffect(() => {
    (async () => {
      await reloadFromCache();
      setIsLoading(false);
    })();
  }, [reloadFromCache]);

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
      // Optimistic update + single-row write (avoids the replace-all diff that
      // could accidentally un-delete rows soft-deleted elsewhere).
      setLogs((prev) => (prev.some((l) => l.id === log.id)
        ? prev.map((l) => (l.id === log.id ? log : l))
        : [log, ...prev]));
      await Storage.saveOneLog(log);
    },
    [],
  );

  const updateLog = useCallback(
    async (log: WorkoutLog) => {
      setLogs((prev) => prev.map((l) => (l.id === log.id ? log : l)));
      await Storage.saveOneLog(log);
    },
    [],
  );

  const deleteLog = useCallback(
    async (id: string) => {
      setLogs((prev) => prev.filter((l) => l.id !== id));
      await Storage.deleteOneLog(id);
    },
    [],
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
      reloadFromCache,
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
      reloadFromCache,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
};
