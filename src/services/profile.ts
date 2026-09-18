/**
 * Editable runner profile (#21).
 *
 * A sibling store to `settings.ts`, kept separate on purpose: settings are
 * preferences that change what the app does, this is identity a runner
 * chooses to show. It works whether or not the runner has signed in with
 * Apple — a local nickname needs no account.
 *
 * Deliberately minimal: a name only. An avatar needs an image picker (a new
 * native dependency); the issue that requested this explicitly allows
 * deferring it, so it is left for a follow-up rather than adding native
 * surface area this change does not need.
 */

import { Directory, File, Paths } from 'expo-file-system';

export type Profile = {
  /** A runner-chosen display name, distinct from anything Apple returns. */
  name: string | null;
};

export const DEFAULT_PROFILE: Profile = { name: null };

const PROFILE_FILE = 'profile.json';

function profileFile(): File {
  return new File(Paths.document, PROFILE_FILE);
}

function parseProfile(value: unknown): Profile {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_PROFILE;
  }
  const raw = value as Partial<Profile>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  return { name: name.length > 0 ? name : null };
}

export async function loadProfile(): Promise<Profile> {
  const file = profileFile();
  if (!file.exists) {
    return DEFAULT_PROFILE;
  }
  try {
    return parseProfile(JSON.parse(await file.text()));
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  const directory = new Directory(Paths.document);
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  const file = profileFile();
  if (!file.exists) {
    file.create();
  }
  file.write(JSON.stringify(parseProfile(profile)));
}
