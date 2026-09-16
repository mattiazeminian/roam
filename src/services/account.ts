/**
 * Account identity (#20).
 *
 * This is the *local* half of Sign in with Apple. It captures the credential,
 * keeps the stable Apple user id plus the name/email Apple returns, and can ask
 * Apple whether the credential is still valid. It deliberately does **not**
 * keep the identity token: without a server to verify it against (#22) the
 * token proves nothing, and storing an unverified credential while treating it
 * as authenticated would be worse than not having it.
 *
 * So: this identity is local and unverified. Nothing privileged depends on it
 * yet — there is no sync, no server, no other user's data — and the code says
 * so rather than implying otherwise.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { Directory, File, Paths } from 'expo-file-system';

export type Account = {
  /** Apple's stable user identifier, used to check the credential later. */
  userId: string;
  /** Display name. Apple only returns it on the very first sign-in. */
  name: string | null;
  /** Email. Apple only returns it on the very first sign-in. */
  email: string | null;
};

const ACCOUNT_FILE = 'account.json';

function accountFile(): File {
  return new File(Paths.document, ACCOUNT_FILE);
}

/** Whether this device can do Sign in with Apple at all. */
export async function isSupported(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Pure mapping from Apple's credential to what ROAM keeps.
 *
 * The name is assembled from its parts rather than via Apple's locale-aware
 * formatter so this stays a pure function; the name is a display convenience,
 * not data anything depends on.
 */
export function accountFromCredential(credential: {
  user?: unknown;
  fullName?: { givenName?: string | null; familyName?: string | null } | null;
  email?: string | null;
}): Account | null {
  const userId = credential?.user;
  if (typeof userId !== 'string' || userId.length === 0) {
    return null;
  }

  const given = credential.fullName?.givenName?.trim() ?? '';
  const family = credential.fullName?.familyName?.trim() ?? '';
  const name = [given, family].filter(Boolean).join(' ') || null;
  const email =
    typeof credential.email === 'string' && credential.email.trim().length > 0
      ? credential.email.trim()
      : null;

  return { userId, name, email };
}

function parseAccount(value: unknown): Account | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Partial<Account>;
  if (typeof raw.userId !== 'string' || raw.userId.length === 0) {
    return null;
  }
  return {
    userId: raw.userId,
    name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : null,
    email: typeof raw.email === 'string' && raw.email.length > 0 ? raw.email : null,
  };
}

export async function loadAccount(): Promise<Account | null> {
  const file = accountFile();
  if (!file.exists) {
    return null;
  }
  try {
    return parseAccount(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}

export async function saveAccount(account: Account): Promise<void> {
  const directory = new Directory(Paths.document);
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  const file = accountFile();
  if (!file.exists) {
    file.create();
  }
  file.write(JSON.stringify(account));
}

export async function clearAccount(): Promise<void> {
  const file = accountFile();
  if (file.exists) {
    file.delete();
  }
}

export type CredentialStatus = 'authorized' | 'revoked' | 'unknown';

/**
 * Whether Apple still considers this credential valid.
 *
 * `unknown` is the honest answer for anything that is not a clear authorized or
 * revoked result — including the simulator, where this call always throws. It
 * must never cause a sign-out on its own.
 */
export async function credentialStatus(userId: string): Promise<CredentialStatus> {
  try {
    const state = await AppleAuthentication.getCredentialStateAsync(userId);
    if (state === AppleAuthentication.AppleAuthenticationCredentialState.AUTHORIZED) {
      return 'authorized';
    }
    if (state === AppleAuthentication.AppleAuthenticationCredentialState.REVOKED) {
      return 'revoked';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Runs the system flow and stores the resulting identity. */
export async function signIn(): Promise<Account | null> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  const account = accountFromCredential(credential);
  if (account) {
    await saveAccount(account);
  }
  return account;
}

/**
 * Signing out only clears the local identity. `AppleAuthentication.signOutAsync`
 * is deliberately not called: Expo's own documentation advises against it, and
 * Apple has no server-side session to end here anyway.
 */
export async function signOut(): Promise<void> {
  await clearAccount();
}
