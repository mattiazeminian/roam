/**
 * The run's lifecycle, as one explicit state machine (#35).
 *
 * Before this, each action in `run-context.tsx` guarded itself ad hoc
 * (`if (status !== 'active') return;`, repeated per callback), which meant a
 * guard was only as good as whoever remembered to add it. Two callbacks had
 * none at all: `finish()` could be called from `idle` and fabricate a bogus
 * completed run with zero distance, and `resumeRecovered()` could be called
 * while a session was already live, silently overwriting it mid-run.
 *
 * This module is the single source of truth for which action is legal from
 * which state. `run-context.tsx` consults it instead of repeating the check
 * inline, so a missing guard is no longer possible by omission.
 */

export type RunSessionStatus = 'idle' | 'active' | 'paused' | 'finished';

export type RunAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'finish'
  | 'resumeRecovered'
  | 'discardRecovered'
  | 'saveCompleted'
  | 'discardCompleted';

/**
 * States each action may run from; any other state makes it a no-op.
 *
 * `start` is legal from every state on purpose: starting a new run
 * deliberately abandons whatever run was live before. That is existing,
 * tested behaviour (see "starting again without finishing tears down the
 * previous subscription" in run-context.test.tsx) — this issue formalises
 * it rather than changing it, per its own "no UI redesign" scope.
 *
 * `discardRecovered` is legal from every state for a different reason: it
 * only clears a stale recovery offer and never touches a live session, so
 * there is nothing for it to corrupt regardless of the current state.
 */
const LEGAL_FROM: Record<RunAction, readonly RunSessionStatus[]> = {
  start: ['idle', 'active', 'paused', 'finished'],
  pause: ['active'],
  resume: ['paused'],
  finish: ['active', 'paused'],
  resumeRecovered: ['idle'],
  discardRecovered: ['idle', 'active', 'paused', 'finished'],
  saveCompleted: ['finished'],
  discardCompleted: ['finished'],
};

/** Whether `action` may run while the session is in `status`. */
export function canTransition(status: RunSessionStatus, action: RunAction): boolean {
  return LEGAL_FROM[action].includes(status);
}
