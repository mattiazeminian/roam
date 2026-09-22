/**
 * Tests for the parts of settings that other features depend on.
 *
 * Onboarding (#19) is gated on `hasCompletedOnboarding`, and that flag decides
 * whether Roam asks for location — so its persistence, and its behaviour for a
 * settings file written before it existed, are worth pinning down.
 */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settings';

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
      return true;
    }
    create() {}
  }

  return {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: { document: { path: 'doc' } },
  };
});

beforeEach(() => {
  mockFiles.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('settings', () => {
  test('a fresh install has not completed onboarding', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.hasCompletedOnboarding).toBe(false);
  });

  test('the onboarding flag round-trips', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, hasCompletedOnboarding: true, unit: 'mi' });
    const loaded = await loadSettings();
    expect(loaded.hasCompletedOnboarding).toBe(true);
    expect(loaded.unit).toBe('mi');
  });

  test('a settings file written before the flag existed reads as not completed', async () => {
    mockFiles.set(
      'doc/settings.json',
      JSON.stringify({ unit: 'km', typicalPaceMinPerKm: 6, defaultDistanceKm: 5 }),
    );
    const loaded = await loadSettings();
    expect(loaded.hasCompletedOnboarding).toBe(false);
    // The other stored values are still honoured.
    expect(loaded.typicalPaceMinPerKm).toBe(6);
  });

  test('the appearance preference round-trips (#145)', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, appearance: 'dark' });
    expect((await loadSettings()).appearance).toBe('dark');
  });

  test('a settings file written before appearance existed defaults to system (#145)', async () => {
    mockFiles.set(
      'doc/settings.json',
      JSON.stringify({ unit: 'km', typicalPaceMinPerKm: 6, defaultDistanceKm: 5 }),
    );
    expect((await loadSettings()).appearance).toBe('system');
    expect(DEFAULT_SETTINGS.appearance).toBe('system');
  });

  test('an unknown appearance value falls back to system (#145)', async () => {
    mockFiles.set(
      'doc/settings.json',
      JSON.stringify({ ...DEFAULT_SETTINGS, appearance: 'midnight' }),
    );
    expect((await loadSettings()).appearance).toBe('system');
  });
});
