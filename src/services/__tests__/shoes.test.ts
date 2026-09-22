/**
 * Tests for the running-shoe model and store (#112, #93).
 *
 * The store is exercised against an in-memory `expo-file-system`, the same way
 * run-storage is, so parsing and corruption handling are tested without a real
 * filesystem or the native module.
 */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  activeShoes,
  addShoe,
  createShoe,
  setDefaultShoe,
  loadShoes,
  removeShoe,
  saveShoes,
  setShoeRetired,
  shoeName,
  type Shoe,
} from '../shoes';

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
  }

  return { File: FakeFile, Directory: FakeDirectory, Paths: { document: { path: 'doc' } } };
});

beforeEach(() => {
  mockFiles.clear();
});

function shoe(overrides: Partial<Shoe> = {}): Shoe {
  return {
    id: 'shoe-1',
    brand: 'Hoka',
    model: 'Clifton 9',
    type: 'road',
    brandKey: null,
    isDefault: false,
    nickname: null,
    addedAt: 1_700_000_000_000,
    retired: false,
    ...overrides,
  };
}

describe('createShoe (#112)', () => {
  test('trims the brand and model and defaults to active', () => {
    const created = createShoe({ brand: '  Hoka ', model: ' Clifton 9  ', id: 'fixed' });
    expect(created).toEqual({
      id: 'fixed',
      brand: 'Hoka',
      model: 'Clifton 9',
      type: 'road',
      brandKey: null,
      isDefault: false,
      nickname: null,
      addedAt: expect.any(Number),
      retired: false,
    });
  });

  test('an empty nickname becomes null rather than an empty string', () => {
    expect(createShoe({ brand: 'Hoka', model: 'Clifton', nickname: '   ' }).nickname).toBeNull();
  });

  test('keeps a real nickname', () => {
    expect(createShoe({ brand: 'Hoka', model: 'Clifton', nickname: 'the blue ones' }).nickname).toBe(
      'the blue ones',
    );
  });

  test('generates distinct ids', () => {
    expect(createShoe({ brand: 'a', model: 'b' }).id).not.toBe(
      createShoe({ brand: 'a', model: 'b' }).id,
    );
  });
});

describe('shoeName', () => {
  test('prefers the nickname', () => {
    expect(shoeName(shoe({ nickname: 'the blue ones' }))).toBe('the blue ones');
  });

  test('falls back to brand and model', () => {
    expect(shoeName(shoe())).toBe('Hoka Clifton 9');
  });
});

describe('shoe list operations', () => {
  test('activeShoes excludes retired shoes', () => {
    const shoes = [shoe({ id: 'a' }), shoe({ id: 'b', retired: true })];
    expect(activeShoes(shoes).map((entry) => entry.id)).toEqual(['a']);
  });

  test('addShoe appends without mutating', () => {
    const original = [shoe({ id: 'a' })];
    const next = addShoe(original, shoe({ id: 'b' }));
    expect(original).toHaveLength(1);
    expect(next.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  test('removeShoe drops only the matching id', () => {
    const shoes = [shoe({ id: 'a' }), shoe({ id: 'b' })];
    expect(removeShoe(shoes, 'a').map((entry) => entry.id)).toEqual(['b']);
  });

  test('setShoeRetired flips only the matching id', () => {
    const shoes = [shoe({ id: 'a' }), shoe({ id: 'b' })];
    const next = setShoeRetired(shoes, 'b', true);
    expect(next.find((entry) => entry.id === 'a')?.retired).toBe(false);
    expect(next.find((entry) => entry.id === 'b')?.retired).toBe(true);
  });

  test('setDefaultShoe keeps one explicit default and supports clearing', () => {
    const shoes = [shoe({ id: 'a', isDefault: true }), shoe({ id: 'b' })];
    expect(setDefaultShoe(shoes, 'b').map((entry) => entry.isDefault)).toEqual([false, true]);
    expect(setDefaultShoe(shoes, null).some((entry) => entry.isDefault)).toBe(false);
  });
});

describe('shoe store', () => {
  test('loadShoes is empty when nothing was saved', async () => {
    expect(await loadShoes()).toEqual([]);
  });

  test('round-trips through saveShoes/loadShoes', async () => {
    await saveShoes([shoe(), shoe({ id: 'shoe-2', nickname: 'the blue ones', retired: true })]);
    const loaded = await loadShoes();
    expect(loaded).toHaveLength(2);
    expect(loaded[1].nickname).toBe('the blue ones');
    expect(loaded[1].retired).toBe(true);
  });

  test('drops malformed entries rather than failing the whole file', async () => {
    await saveShoes([shoe()]);
    mockFiles.set(
      'doc/shoes.json',
      JSON.stringify([shoe(), { id: 'bad' }, null, 42, { id: 'ok', brand: 'a', model: 'b' }]),
    );
    const loaded = await loadShoes();
    expect(loaded.map((entry) => entry.id)).toEqual(['shoe-1', 'ok']);
  });

  test('a non-array file loads as empty', async () => {
    mockFiles.set('doc/shoes.json', JSON.stringify({ not: 'an array' }));
    expect(await loadShoes()).toEqual([]);
  });

  test('a corrupt file loads as empty, not a crash', async () => {
    mockFiles.set('doc/shoes.json', '{not json');
    expect(await loadShoes()).toEqual([]);
  });

  test('a legacy shoe without addedAt or retired still loads', async () => {
    mockFiles.set('doc/shoes.json', JSON.stringify([{ id: 'old', brand: 'a', model: 'b' }]));
    const loaded = await loadShoes();
    expect(loaded).toEqual([shoe({ id: 'old', brand: 'a', model: 'b', addedAt: 0, retired: false })]);
  });
});
