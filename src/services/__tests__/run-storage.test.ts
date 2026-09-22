/**
 * Tests for local run persistence, including the in-progress checkpoint
 * added for issue #11.
 *
 * `expo-file-system`'s `File`/`Directory` classes are replaced with a small
 * in-memory model here — this exercises `run-storage.ts`'s own logic (what
 * gets written, what gets parsed back, where the checkpoint lives) without
 * touching a real filesystem or the native module.
 */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  checkpointRun,
  clearInProgressRun,
  deleteRun,
  getInProgressRun,
  getRun,
  listRuns,
  saveRun,
} from '../run-storage';
import type { SavedRun } from '../run-session';

// Prefixed `mock` so jest's module-factory hoisting allows referencing it
// from inside jest.mock() below. jest.mock() calls are hoisted above these
// imports by babel-plugin-jest-hoist regardless of their textual position.
const mockFiles = new Map<string, string>();

jest.mock('expo-file-system', () => {
  class FakeFile {
    path: string;
    constructor(parent: { path: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.path;
      this.path = name === undefined ? base : `${base}/${name}`;
    }
    get name() {
      return this.path.split('/').pop() as string;
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    create() {
      if (!mockFiles.has(this.path)) {
        mockFiles.set(this.path, '');
      }
    }
    write(content: string) {
      mockFiles.set(this.path, content);
    }
    async text() {
      const content = mockFiles.get(this.path);
      if (content === undefined) {
        throw new Error('not found');
      }
      return content;
    }
    delete() {
      mockFiles.delete(this.path);
    }
  }

  class FakeDirectory {
    path: string;
    constructor(parent: { path: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.path;
      this.path = name === undefined ? base : `${base}/${name}`;
    }
    get exists() {
      for (const key of mockFiles.keys()) {
        if (key.startsWith(`${this.path}/`)) {
          return true;
        }
      }
      return false;
    }
    create() {
      // Directories are implicit here — a file's own write is what "creates" it.
    }
    list() {
      const entries: FakeFile[] = [];
      for (const key of mockFiles.keys()) {
        if (key.startsWith(`${this.path}/`) && !key.slice(this.path.length + 1).includes('/')) {
          entries.push(new FakeFile(key));
        }
      }
      return entries;
    }
  }

  return {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: { document: { path: 'doc' } },
  };
});

function run(overrides: Partial<SavedRun> = {}): SavedRun {
  return {
    id: 'run-1',
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_600_000,
    route: null,
    targetDistanceKm: 5,
    distanceKm: 1.2,
    durationSeconds: 480,
    averagePaceMinPerKm: 6.67,
    coordinates: [
      { latitude: 40.748, longitude: -73.9857 },
      { latitude: 40.749, longitude: -73.9857 },
    ],
    status: 'finished',
    ...overrides,
  };
}

beforeEach(() => {
  mockFiles.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('finished runs', () => {
  test('round-trips through saveRun/getRun', async () => {
    await saveRun(run());
    const loaded = await getRun('run-1');
    expect(loaded?.distanceKm).toBe(1.2);
    expect(loaded?.status).toBe('finished');
  });

  test('listRuns sorts newest first', async () => {
    await saveRun(run({ id: 'a', startedAt: 1 }));
    await saveRun(run({ id: 'b', startedAt: 2 }));
    const runs = await listRuns();
    expect(runs.map((r) => r.id)).toEqual(['b', 'a']);
  });

  test('deleteRun removes the file', async () => {
    await saveRun(run());
    await deleteRun('run-1');
    expect(await getRun('run-1')).toBeNull();
  });
});

describe('in-progress checkpoint (#11)', () => {
  test('checkpointRun is readable back via getInProgressRun', async () => {
    await checkpointRun(run({ status: 'active', distanceKm: 0.6 }));
    const recovered = await getInProgressRun();
    expect(recovered?.status).toBe('active');
    expect(recovered?.distanceKm).toBe(0.6);
  });

  test('getInProgressRun is null when nothing was checkpointed', async () => {
    expect(await getInProgressRun()).toBeNull();
  });

  test('repeated checkpoints overwrite the same record rather than accumulating files', async () => {
    await checkpointRun(run({ status: 'active', distanceKm: 0.3 }));
    await checkpointRun(run({ status: 'active', distanceKm: 0.9 }));
    const recovered = await getInProgressRun();
    expect(recovered?.distanceKm).toBe(0.9);
    expect(mockFiles.size).toBe(1);
  });

  test('clearInProgressRun removes the checkpoint', async () => {
    await checkpointRun(run({ status: 'paused' }));
    await clearInProgressRun();
    expect(await getInProgressRun()).toBeNull();
  });

  test('a checkpoint never appears in listRuns, so History cannot show an in-progress run', async () => {
    await saveRun(run({ id: 'finished-1' }));
    await checkpointRun(run({ id: 'run-1', status: 'active' }));
    const runs = await listRuns();
    expect(runs.map((r) => r.id)).toEqual(['finished-1']);
  });
});

describe('planned workout link (#116)', () => {
  test('a run started from a planned workout keeps the link', async () => {
    await saveRun(run({ plannedWorkoutId: 'workout-7' }));
    const loaded = await getRun('run-1');
    expect(loaded?.plannedWorkoutId).toBe('workout-7');
  });

  test('a free run has no planned workout, and older runs still load', async () => {
    await saveRun(run());
    expect((await getRun('run-1'))?.plannedWorkoutId).toBeUndefined();

    const legacy = run({ id: 'legacy' });
    delete legacy.plannedWorkoutId;
    await saveRun(legacy);
    expect((await getRun('legacy'))?.distanceKm).toBe(1.2);
  });
});

describe('workout type (#116)', () => {
  test('a run labelled on Record keeps the type', async () => {
    await saveRun(run({ workoutType: 'tempo' }));
    expect((await getRun('run-1'))?.workoutType).toBe('tempo');
  });

  test('a missing type is absent, not guessed', async () => {
    await saveRun(run());
    expect((await getRun('run-1'))?.workoutType).toBeUndefined();
  });

  test('an unknown type is dropped, not carried through', async () => {
    // A hand-edited or future type must not survive parsing.
    await saveRun({ ...run(), workoutType: 'not-a-type' } as unknown as SavedRun);
    expect((await getRun('run-1'))?.workoutType).toBeUndefined();
  });
});

describe('structured steps (#151)', () => {
  test('a structured run keeps its steps and grouping', async () => {
    await saveRun(
      run({
        workoutType: 'intervals',
        steps: [
          { id: 'w', kind: 'warmup', label: 'Warm up', target: { kind: 'duration', seconds: 600 } },
          {
            id: 'r1',
            kind: 'work',
            label: 'Run',
            target: { kind: 'distance', meters: 400 },
            repeatGroupId: 'main',
            repIndex: 1,
            repCount: 6,
          },
        ],
      }),
    );
    const loaded = await getRun('run-1');
    expect(loaded?.steps).toHaveLength(2);
    expect(loaded?.steps?.[1]).toMatchObject({
      kind: 'work',
      label: 'Run',
      target: { kind: 'distance', meters: 400 },
      repIndex: 1,
      repCount: 6,
    });
  });

  test('a run with no steps loads without them', async () => {
    await saveRun(run());
    expect((await getRun('run-1'))?.steps).toBeUndefined();
  });
});

describe('timed track (#32)', () => {  test('fix times round-trip with the track', async () => {
    const timestamps = [1_700_000_000_000, 1_700_000_010_000];
    await saveRun(run({ timestamps }));
    const loaded = await getRun('run-1');
    expect(loaded?.timestamps).toEqual(timestamps);
  });

  test('a run saved before times existed still loads, with no times', async () => {
    const legacy = run();
    delete legacy.timestamps;
    await saveRun(legacy);
    const loaded = await getRun('run-1');
    expect(loaded?.distanceKm).toBe(1.2);
    expect(loaded?.timestamps).toBeUndefined();
  });

  test('a non-numeric time becomes unknown rather than being dropped, keeping alignment', async () => {
    await saveRun(run({ timestamps: [1_700_000_000_000, null] }));
    const loaded = await getRun('run-1');
    expect(loaded?.timestamps).toHaveLength(loaded?.coordinates.length ?? 0);
    expect(loaded?.timestamps?.[1]).toBeNull();
  });
});
