import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  addWorkouts,
  buildPlan,
  EMPTY_TRAINING,
  loadTraining,
  removeWorkout as removeWorkoutFrom,
  saveTraining,
  setWorkoutStatus,
  type PlanInput,
  type PlannedWorkout,
  type TrainingState,
  type WorkoutStatus,
} from './training';

export type TrainingContextValue = {
  state: TrainingState;
  /** False until the stored plan and workouts have been read. */
  loaded: boolean;
  /** Create a plan from the runner's choices. */
  createPlanFor: (input: PlanInput) => Promise<void>;
  /** Drop the plan. Workouts already recorded are kept. */
  clearPlan: () => Promise<void>;
  /** Add scheduled workouts, ignoring any already present. */
  scheduleWorkouts: (workouts: readonly PlannedWorkout[]) => Promise<void>;
  /** Move a workout's status; completing it links the run that did it. */
  markWorkout: (id: string, status: WorkoutStatus, runId?: string | null) => Promise<void>;
  removeWorkout: (id: string) => Promise<void>;
};

const TrainingContext = createContext<TrainingContextValue | null>(null);

/**
 * The runner's plan and scheduled workouts.
 *
 * One owner for the training state, like the other providers, so Home, the plan
 * screen and anything later all read the same data. Every change is written
 * through immediately: a plan is small, and losing one to a process kill would
 * be worse than the write.
 */
export function TrainingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TrainingState>(EMPTY_TRAINING);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void loadTraining()
      .then((stored) => {
        if (active) {
          setState(stored);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const createPlanFor = useCallback(
    async (input: PlanInput) => {
      const next: TrainingState = { ...state, plan: buildPlan(input) };
      setState(next);
      await saveTraining(next);
    },
    [state],
  );

  const clearPlan = useCallback(async () => {
    const next: TrainingState = { ...state, plan: null };
    setState(next);
    await saveTraining(next);
  }, [state]);

  const scheduleWorkouts = useCallback(
    async (workouts: readonly PlannedWorkout[]) => {
      const next = addWorkouts(state, workouts);
      setState(next);
      await saveTraining(next);
    },
    [state],
  );

  const markWorkout = useCallback(
    async (id: string, status: WorkoutStatus, runId: string | null = null) => {
      const next = setWorkoutStatus(state, id, status, runId);
      setState(next);
      await saveTraining(next);
    },
    [state],
  );

  const removeWorkout = useCallback(
    async (id: string) => {
      const next = removeWorkoutFrom(state, id);
      setState(next);
      await saveTraining(next);
    },
    [state],
  );

  const value = useMemo<TrainingContextValue>(
    () => ({ state, loaded, createPlanFor, clearPlan, scheduleWorkouts, markWorkout, removeWorkout }),
    [state, loaded, createPlanFor, clearPlan, scheduleWorkouts, markWorkout, removeWorkout],
  );

  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
}

export function useTraining(): TrainingContextValue {
  const value = useContext(TrainingContext);
  if (!value) {
    throw new Error('useTraining must be used inside <TrainingProvider>');
  }
  return value;
}
