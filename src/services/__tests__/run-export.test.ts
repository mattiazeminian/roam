/**
 * Tests for GPX export (#45).
 *
 * The export is the runner's data leaving the app, so it must contain exactly
 * what was recorded. These tests pin the two things most likely to be wrong:
 * a point claiming a time it does not have, and a run with no track being
 * exported as if it had one.
 */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { runToTrack, toGpxDocument, writeRunsGpx } from '../run-export';
import type { SavedRun } from '../run-session';

const mockFiles = new Map<string, string>();

jest.mock('expo-file-system', () => {
  class FakeFile {
    path: string;
    constructor(parent: { path: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.path;
      this.path = name === undefined ? base : `${base}/${name}`;
    }
    get uri() {
      return `file://${this.path}`;
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
      return mockFiles.get(this.path) ?? '';
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
      return true;
    }
    create() {}
  }

  return { File: FakeFile, Directory: FakeDirectory, Paths: { document: { path: 'doc' } } };
});

const START = Date.UTC(2026, 0, 2, 7, 30);

function run(overrides: Partial<SavedRun> = {}): SavedRun {
  return {
    id: 'run-1',
    startedAt: START,
    endedAt: START + 1_800_000,
    route: null,
    targetDistanceKm: 5,
    distanceKm: 5,
    durationSeconds: 1800,
    averagePaceMinPerKm: 6,
    coordinates: [
      { latitude: 40.7484, longitude: -73.9857 },
      { latitude: 40.7495, longitude: -73.9849 },
    ],
    timestamps: [START, START + 60_000],
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

describe('runToTrack (#45)', () => {
  test('writes each point with its position and, when known, its time', () => {
    const track = runToTrack(run());
    expect(track).toContain('lat="40.7484" lon="-73.9857"');
    expect(track).toContain(`<time>${new Date(START).toISOString()}</time>`);
    expect(track).toContain(`<time>${new Date(START + 60_000).toISOString()}</time>`);
  });

  test('omits the time element for a point whose time is unknown', () => {
    const track = runToTrack(run({ timestamps: [START, null] }));
    expect(track?.match(/<time>/g)?.length).toBe(1);
    expect(track).toContain('lon="-73.9849"></trkpt>');
  });

  test('refuses to export a run with no usable track', () => {
    expect(runToTrack(run({ coordinates: [] }))).toBeNull();
    expect(runToTrack(run({ coordinates: [{ latitude: 1, longitude: 2 }] }))).toBeNull();
  });
});

describe('toGpxDocument (#45)', () => {
  test('wraps tracks in a valid GPX document and reports what it wrote', () => {
    const withTrack = run({ id: 'with-track' });
    const withoutTrack = run({ id: 'no-track', coordinates: [] });

    const result = toGpxDocument([withTrack, withoutTrack]);

    expect(result.exported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(result.xml).toContain('<gpx version="1.1" creator="ROAM"');
    expect(result.xml.trimEnd().endsWith('</gpx>')).toBe(true);
    expect(result.xml.match(/<trk>/g)?.length).toBe(1);
  });

  test('produces a valid empty document for no runs', () => {
    const result = toGpxDocument([]);
    expect(result.exported).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.xml).toContain('</gpx>');
  });
});

describe('writeRunsGpx (#45)', () => {
  test('writes the document and returns where it went', async () => {
    const result = await writeRunsGpx([run()]);
    expect(result.exported).toBe(1);
    expect(result.uri).toBe('file://doc/roam-runs.gpx');
    expect(mockFiles.get('doc/roam-runs.gpx')).toContain('<gpx');
  });
});
