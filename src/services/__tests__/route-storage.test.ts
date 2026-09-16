/**
 * Tests for local saved-route persistence (#18).
 *
 * Uses the same in-memory `expo-file-system` replacement as
 * `run-storage.test.ts`: this exercises what `route-storage.ts` writes, parses
 * back and de-duplicates, without a real filesystem or native module.
 */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { deleteRoute, getRoute, isRouteSaved, listRoutes, saveRoute } from '../route-storage';
import type { Coordinate, RouteCandidate } from '../routing';

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
    create() {}
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

const START: Coordinate = { latitude: 40.748412, longitude: -73.985678 };
const MID: Coordinate = { latitude: 40.750011, longitude: -73.980023 };

function route(overrides: Partial<RouteCandidate> = {}): RouteCandidate {
  return {
    id: 'route-1',
    distanceKm: 5,
    estimatedMinutes: 30,
    geometry: [START, MID, START],
    characteristics: ['Mostly footways'],
    ...overrides,
  };
}

beforeEach(() => {
  mockFiles.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('saved routes (#18)', () => {
  test('round-trips through saveRoute/listRoutes', async () => {
    const saved = await saveRoute(route());
    const stored = await listRoutes();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(saved.id);
    expect(stored[0].route.distanceKm).toBe(5);
    expect(stored[0].route.characteristics).toEqual(['Mostly footways']);
    expect(stored[0].route.geometry).toHaveLength(3);
  });

  test('getRoute returns the saved route by identity', async () => {
    const saved = await saveRoute(route());
    expect((await getRoute(saved.id))?.route.distanceKm).toBe(5);
    expect(await getRoute('no-such-id')).toBeNull();
  });

  test('saving the same route twice does not create a duplicate', async () => {
    await saveRoute(route());
    await saveRoute(route());
    expect(mockFiles.size).toBe(1);
    expect(await listRoutes()).toHaveLength(1);
  });

  test('re-saving keeps the original savedAt', async () => {
    const first = await saveRoute(route());
    const second = await saveRoute(route());
    expect(second.savedAt).toBe(first.savedAt);
  });

  test('a different route is stored separately', async () => {
    await saveRoute(route());
    await saveRoute(route({ distanceKm: 8, geometry: [MID, START, MID] }));
    expect(await listRoutes()).toHaveLength(2);
  });

  test('isRouteSaved reflects whether this exact route is stored', async () => {
    expect(await isRouteSaved(route())).toBe(false);
    await saveRoute(route());
    expect(await isRouteSaved(route())).toBe(true);
  });

  test('coordinates are rounded to storage precision on save', async () => {
    const saved = await saveRoute(route());
    const stored = await getRoute(saved.id);
    expect(stored?.route.geometry[0]).toEqual({
      latitude: 40.74841,
      longitude: -73.98568,
    });
  });

  test('deleteRoute removes it', async () => {
    const saved = await saveRoute(route());
    await deleteRoute(saved.id);
    expect(await getRoute(saved.id)).toBeNull();
    expect(await listRoutes()).toHaveLength(0);
  });

  test('listRoutes is newest first', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    await saveRoute(route({ distanceKm: 5 }));
    now.mockReturnValue(2_000);
    await saveRoute(route({ distanceKm: 8, geometry: [MID, START, MID] }));
    const stored = await listRoutes();
    expect(stored.map((entry) => entry.savedAt)).toEqual([2_000, 1_000]);
  });

  test('a corrupt file is skipped rather than crashing the list', async () => {
    await saveRoute(route());
    mockFiles.set('doc/routes/broken.json', '{not json');
    expect(await listRoutes()).toHaveLength(1);
  });
});
