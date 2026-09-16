/**
 * Tests for the local identity half of Sign in with Apple (#20).
 *
 * The system sign-in sheet cannot be exercised without a device, but the part
 * that decides what ROAM keeps — mapping Apple's credential, storing it, and
 * reading Apple's credential state honestly — is covered here.
 */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as AppleAuthentication from 'expo-apple-authentication';

import {
  accountFromCredential,
  clearAccount,
  credentialStatus,
  loadAccount,
  saveAccount,
  signOut,
} from '../account';

const mockFiles = new Map<string, string>();

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  getCredentialStateAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationCredentialState: {
    REVOKED: 0,
    AUTHORIZED: 1,
    NOT_FOUND: 2,
    TRANSFERRED: 3,
  },
}));

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


const getCredentialStateAsyncMock = AppleAuthentication.getCredentialStateAsync as unknown as jest.Mock<
  typeof AppleAuthentication.getCredentialStateAsync
>;

beforeEach(() => {
  mockFiles.clear();
  getCredentialStateAsyncMock.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('accountFromCredential (#20)', () => {
  test('keeps the stable user id and assembles the name from its parts', () => {
    expect(
      accountFromCredential({
        user: 'apple-user-1',
        fullName: { givenName: ' Ada ', familyName: ' Lovelace ' },
        email: 'ada@example.com',
      }),
    ).toEqual({ userId: 'apple-user-1', name: 'Ada Lovelace', email: 'ada@example.com' });
  });

  test('handles the partial values Apple actually returns after the first sign-in', () => {
    // Apple only sends name/email on the very first sign-in.
    expect(accountFromCredential({ user: 'apple-user-1', fullName: null, email: null })).toEqual({
      userId: 'apple-user-1',
      name: null,
      email: null,
    });
    expect(accountFromCredential({ user: 'u', fullName: { givenName: 'Ada' } })?.name).toBe('Ada');
    expect(accountFromCredential({ user: 'u', email: '   ' })?.email).toBeNull();
  });

  test('rejects a credential with no usable user id', () => {
    expect(accountFromCredential({ user: '' })).toBeNull();
    expect(accountFromCredential({})).toBeNull();
  });
});

describe('account storage (#20)', () => {
  test('round-trips, and is null when nothing is stored', async () => {
    expect(await loadAccount()).toBeNull();
    await saveAccount({ userId: 'apple-user-1', name: 'Ada', email: null });
    expect(await loadAccount()).toEqual({ userId: 'apple-user-1', name: 'Ada', email: null });
  });

  test('a corrupt file loads as no account rather than throwing', async () => {
    mockFiles.set('doc/account.json', '{not json');
    expect(await loadAccount()).toBeNull();
  });

  test('signOut clears the stored identity', async () => {
    await saveAccount({ userId: 'apple-user-1', name: 'Ada', email: null });
    await signOut();
    expect(await loadAccount()).toBeNull();
  });

  test('clearAccount is safe when there is nothing stored', async () => {
    await expect(clearAccount()).resolves.toBeUndefined();
  });
});

describe('credentialStatus (#20)', () => {
  test('reports an authorized credential', async () => {
    getCredentialStateAsyncMock.mockResolvedValue(
      AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED,
    );
    expect(await credentialStatus('apple-user-1')).toBe('authorized');
  });

  test('reports a revoked credential', async () => {
    getCredentialStateAsyncMock.mockResolvedValue(
      AppleAuthentication.AppleAuthenticationCredentialState.REVOKED,
    );
    expect(await credentialStatus('apple-user-1')).toBe('revoked');
  });

  test('says unknown — never revoked — when the state cannot be read', async () => {
    // The simulator always throws this call, and a network/OS failure must not
    // be treated as a sign-out.
    getCredentialStateAsyncMock.mockRejectedValue(new Error('simulator'));
    expect(await credentialStatus('apple-user-1')).toBe('unknown');
  });
});
