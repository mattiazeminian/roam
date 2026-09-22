/**
 * Tests for the completed-run share message (#24).
 *
 * The message is the only thing a recipient sees, so the wording matters: real
 * numbers, the runner's own unit, and no placeholder presented as a result.
 */
import { describe, expect, test } from '@jest/globals';

import { runShareMessage } from '../run-share';
import { routeShareLink } from '../route-share';
import { formatDuration, formatRunDate, type SavedRun } from '../run-session';
import type { Formatters } from '../settings-context';

const STARTED_AT = Date.UTC(2026, 8, 15, 7, 42);

function kmFormatters(): Formatters {
  return {
    unit: 'km',
    unitLabel: 'km',
    unitSpoken: 'kilometers',
    distance: (meters) => (meters / 1000).toFixed(2),
    pace: (pace) => (pace === null ? `--'--"` : `5'30"`),
    paceWithUnit: (pace) => (pace === null ? `--'--"/km` : `5'30"/km`),
    paceSpoken: () => '5 minutes 30 seconds per kilometer',
  };
}

function run(overrides: Partial<SavedRun> = {}): SavedRun {
  return {
    id: 'run-1',
    startedAt: STARTED_AT,
    endedAt: STARTED_AT + 1_650_000,
    route: null,
    targetDistanceKm: 5,
    distanceKm: 5,
    durationSeconds: 1650,
    averagePaceMinPerKm: 5.5,
    coordinates: [],
    status: 'finished',
    ...overrides,
  };
}

describe('runShareMessage (#24)', () => {
  test('states the recorded distance, time, pace and date', () => {
    const message = runShareMessage(run(), kmFormatters());
    expect(message).toContain('5.00 km');
    expect(message).toContain(formatDuration(1650));
    expect(message).toContain(`5'30"/km`);
    expect(message).toContain(formatRunDate(STARTED_AT));
    expect(message.endsWith('.')).toBe(true);
  });

  test('omits pace entirely when it is unavailable, rather than sending a placeholder', () => {
    const message = runShareMessage(run({ averagePaceMinPerKm: null }), kmFormatters());
    expect(message).not.toContain(`--'--"`);
    expect(message).not.toContain(' at ');
  });

  test('uses the runner\'s own unit', () => {
    const miles: Formatters = {
      ...kmFormatters(),
      unit: 'mi',
      unitLabel: 'mi',
      unitSpoken: 'miles',
      distance: (meters) => (meters / 1609.344).toFixed(2),
      paceWithUnit: () => `8'51"/mi`,
    };
    const message = runShareMessage(run(), miles);
    expect(message).toContain('mi');
    expect(message).toContain(`8'51"/mi`);
    expect(message).not.toContain('km');
  });

  test('carries the route link when the run had a planned route (#96)', () => {
    const route = {
      id: 'route-1',
      distanceKm: 5,
      estimatedMinutes: 28,
      geometry: [
        { latitude: 45.46, longitude: 9.19 },
        { latitude: 45.47, longitude: 9.2 },
        { latitude: 45.46, longitude: 9.19 },
      ],
      characteristics: ['loop'],
    };
    const message = runShareMessage(run({ route }), kmFormatters());
    expect(message).toContain(routeShareLink(route));
    expect(message).toContain('Run this route:');
  });

  test('sends no route link when the run had no planned route (#96)', () => {
    const message = runShareMessage(run(), kmFormatters());
    expect(message).not.toContain('Run this route:');
    expect(message).not.toContain('roam://');
  });
});
