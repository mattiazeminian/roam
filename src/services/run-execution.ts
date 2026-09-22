import type { WorkoutType } from './training';

export type RunExecutionMode = 'free' | 'time' | 'distance';

export function runExecutionMode(
  workoutType: WorkoutType | null,
  targetDurationSeconds: number,
  targetDistanceKm: number,
): RunExecutionMode {
  if (targetDurationSeconds > 0) return 'time';
  if (workoutType === null && targetDistanceKm <= 0) return 'free';
  return 'distance';
}

export function remainingDurationSeconds(targetSeconds: number, activeSeconds: number): number {
  return Math.max(0, Math.ceil(targetSeconds - activeSeconds));
}
