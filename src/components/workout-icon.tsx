import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';

import type { WorkoutType } from '@/services/training';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

/**
 * A glyph per kind of run, shared by every surface that lists workouts, so the
 * same session never wears two different icons.
 *
 * Chosen so a glance distinguishes them without reading: a runner for easy, a
 * leaf for recovery, a road for the long run, a stopwatch for tempo, a bolt for
 * intervals, a shuffle for fartlek, a timer for short.
 */
export const WORKOUT_SYMBOLS: Record<WorkoutType, SymbolName> = {
  easy: 'figure.run',
  recovery: 'leaf',
  long: 'road.lanes',
  tempo: 'stopwatch',
  intervals: 'bolt',
  fartlek: 'shuffle',
  short: 'timer',
};

export function WorkoutIcon({
  type,
  size,
  tintColor,
}: {
  type: WorkoutType;
  size: number;
  tintColor: string;
}) {
  return <SymbolView name={WORKOUT_SYMBOLS[type]} size={size} tintColor={tintColor} />;
}
