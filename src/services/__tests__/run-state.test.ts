/**
 * Tests for the run lifecycle state machine (#35).
 */
import { describe, expect, test } from '@jest/globals';

import { canTransition, type RunAction, type RunSessionStatus } from '../run-state';

const STATES: RunSessionStatus[] = ['idle', 'active', 'paused', 'finished'];

describe('canTransition', () => {
  test('start is legal from every state', () => {
    for (const status of STATES) {
      expect(canTransition(status, 'start')).toBe(true);
    }
  });

  test('discardRecovered is legal from every state', () => {
    for (const status of STATES) {
      expect(canTransition(status, 'discardRecovered')).toBe(true);
    }
  });

  test('pause is only legal while active', () => {
    expect(canTransition('active', 'pause')).toBe(true);
    expect(canTransition('idle', 'pause')).toBe(false);
    expect(canTransition('paused', 'pause')).toBe(false);
    expect(canTransition('finished', 'pause')).toBe(false);
  });

  test('resume is only legal while paused', () => {
    expect(canTransition('paused', 'resume')).toBe(true);
    expect(canTransition('idle', 'resume')).toBe(false);
    expect(canTransition('active', 'resume')).toBe(false);
    expect(canTransition('finished', 'resume')).toBe(false);
  });

  test('finish is legal from active or paused, never from idle or finished', () => {
    expect(canTransition('active', 'finish')).toBe(true);
    expect(canTransition('paused', 'finish')).toBe(true);
    expect(canTransition('idle', 'finish')).toBe(false);
    expect(canTransition('finished', 'finish')).toBe(false);
  });

  test('resumeRecovered is only legal from idle', () => {
    expect(canTransition('idle', 'resumeRecovered')).toBe(true);
    expect(canTransition('active', 'resumeRecovered')).toBe(false);
    expect(canTransition('paused', 'resumeRecovered')).toBe(false);
    expect(canTransition('finished', 'resumeRecovered')).toBe(false);
  });

  test('saveCompleted and discardCompleted are only legal from finished', () => {
    const resolvers: RunAction[] = ['saveCompleted', 'discardCompleted'];
    for (const action of resolvers) {
      expect(canTransition('finished', action)).toBe(true);
      expect(canTransition('idle', action)).toBe(false);
      expect(canTransition('active', action)).toBe(false);
      expect(canTransition('paused', action)).toBe(false);
    }
  });
});
