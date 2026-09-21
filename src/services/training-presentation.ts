import type { TrainingPlan } from './training';

export function planGoalLabel(plan: TrainingPlan): string {
  if (plan.goal.kind === 'fitness') {
    return 'General fitness';
  }
  if (plan.goal.targetKm === null) {
    return plan.goal.kind === 'race' ? 'Race training' : 'Distance training';
  }
  return `${plan.goal.kind === 'race' ? 'Training for' : 'Working toward'} ${plan.goal.targetKm} km`;
}
