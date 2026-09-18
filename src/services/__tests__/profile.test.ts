/**
 * Tests for the editable runner profile (#21).
 */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { DEFAULT_PROFILE, loadProfile, saveProfile } from '../profile';

const mockFiles = new Map<string, string>();

jest.mock('expo-file-system', () => {
  class FakeFile {
    path: string;
    constructor(parent: { path: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.path;
      this.path = name === undefined ? base : `${base}/${name}`;
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

describe('profile', () => {
  test('a fresh install has no name', async () => {
    expect(await loadProfile()).toEqual(DEFAULT_PROFILE);
  });

  test('a name round-trips', async () => {
    await saveProfile({ ...DEFAULT_PROFILE, name: 'Jamie' });
    expect(await loadProfile()).toEqual({ ...DEFAULT_PROFILE, name: 'Jamie' });
  });

  test('an empty or whitespace-only name is stored as no name, not as an empty string', async () => {
    await saveProfile({ ...DEFAULT_PROFILE, name: '   ' });
    expect(await loadProfile()).toEqual({ ...DEFAULT_PROFILE, name: null });
  });

  test('a name is trimmed', async () => {
    await saveProfile({ ...DEFAULT_PROFILE, name: '  Jamie  ' });
    expect(await loadProfile()).toEqual({ ...DEFAULT_PROFILE, name: 'Jamie' });
  });

  test('a damaged file falls back to the default rather than crashing', async () => {
    mockFiles.set('doc/profile.json', '{not json');
    expect(await loadProfile()).toEqual(DEFAULT_PROFILE);
  });

  test('age, weight and avatar round-trip (#108)', async () => {
    await saveProfile({
      ...DEFAULT_PROFILE,
      name: 'Jamie',
      age: 34,
      weightKg: 72,
      avatarUri: 'file://doc/avatar.jpg',
    });
    expect(await loadProfile()).toEqual({
      name: 'Jamie',
      age: 34,
      weightKg: 72,
      avatarUri: 'file://doc/avatar.jpg',
    });
  });

  test('implausible age or weight is stored as absent, not clamped to a wrong number', async () => {
    await saveProfile({ ...DEFAULT_PROFILE, age: 999, weightKg: -5 });
    expect(await loadProfile()).toEqual(DEFAULT_PROFILE);
  });

  test('a fractional age or weight is rounded to a whole number', async () => {
    await saveProfile({ ...DEFAULT_PROFILE, age: 34.6, weightKg: 72.4 });
    const loaded = await loadProfile();
    expect(loaded.age).toBe(35);
    expect(loaded.weightKg).toBe(72);
  });
});
