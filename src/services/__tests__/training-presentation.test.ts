import { describe, expect, it } from '@jest/globals';

import { planGoalLabel } from '../training-presentation';
import type { TrainingPlan } from '../training';

const plan = (kind: TrainingPlan['goal']['kind'], targetKm: number | null): TrainingPlan => ({
  id: 'plan-1',
  createdAt: 0,
  goal: { kind, targetKm, raceDate: null },
  runsPerWeek: 3,
  preferredDays: [2, 4, 6],
  level: 'occasional',
});

describe('training presentation', () => {
  it('describes a plan from its stored goal without inventing a target', () => {
    expect(planGoalLabel(plan('fitness', null))).toBe('General fitness');
    expect(planGoalLabel(plan('distance', 10))).toBe('Working toward 10 km');
    expect(planGoalLabel(plan('race', 21.1))).toBe('Training for 21.1 km');
  });
});
