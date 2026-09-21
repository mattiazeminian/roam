/**
 * The runner's profile (#108, #90).
 *
 * Sibling to `settings.ts`, kept separate on purpose: settings change what the
 * app does, this is who the runner is. It works with or without an Apple
 * account.
 *
 * Profile data is intentionally small: identity only. Training does not need
 * body measurements, so ROAM does not ask for or retain height or weight.
 */

import { Directory, File, Paths } from 'expo-file-system';

export type Profile = {
  /** A runner-chosen display name, distinct from anything Apple returns. */
  name: string | null;
  /** Years. Displayed only. */
  age: number | null;
  /** A file URI in the app's document directory, or null. */
  avatarUri: string | null;
};

export const DEFAULT_PROFILE: Profile = {
  name: null,
  age: null,
  avatarUri: null,
};

const PROFILE_FILE = 'profile.json';
const AVATAR_FILE = 'avatar.jpg';

const MIN_AGE = 5;
const MAX_AGE = 120;

function profileFile(): File {
  return new File(Paths.document, PROFILE_FILE);
}

function clampOrNull(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value < min || value > max) {
    return null;
  }
  return Math.round(value);
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseProfile(value: unknown): Profile {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_PROFILE;
  }
  const raw = value as Partial<Profile>;
  return {
    name: textOrNull(raw.name),
    age: clampOrNull(raw.age, MIN_AGE, MAX_AGE),
    avatarUri: textOrNull(raw.avatarUri),
  };
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
  const stored = parseProfile(profile);
  file.write(JSON.stringify(stored));
  for (const listener of listeners) {
    listener(stored);
  }
}

type ProfileListener = (profile: Profile) => void;

const listeners = new Set<ProfileListener>();

/**
 * Notified whenever the profile is saved, so a surface that mirrors it — the
 * Profile tab's avatar, which would otherwise only refresh on relaunch —
 * stays current while the app is running.
 */
export function subscribeToProfile(listener: ProfileListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Pick a square photo and copy it into the document directory.
 *
 * Copied rather than referenced: the picker hands back a cache path that the OS
 * is free to evict, which would silently blank the avatar later. Written as
 * base64, which is what the picker gives us without a native copy step.
 *
 * Returns the new file URI, or null when the runner cancels, denies access, or
 * the picker is not built into this binary.
 */
type ImagePickerModule = typeof import('expo-image-picker');

/**
 * The picker is required on demand rather than imported at module scope.
 * `profile.ts` is imported by Home, so an eager import takes the whole app down
 * on a build that has not linked the native module yet — which is exactly what
 * happened when it was added. The same guard the map already uses (#49).
 */
function loadImagePicker(): ImagePickerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-picker') as ImagePickerModule;
  } catch {
    return null;
  }
}

export async function pickAvatar(): Promise<string | null> {
  const ImagePicker = loadImagePicker();
  if (!ImagePicker) {
    return null;
  }

  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]?.base64) {
      return null;
    }

    const directory = new Directory(Paths.document);
    if (!directory.exists) {
      directory.create({ intermediates: true });
    }
    const file = new File(Paths.document, AVATAR_FILE);
    if (!file.exists) {
      file.create();
    }
    file.write(result.assets[0].base64, { encoding: 'base64' });
    return file.uri;
  } catch {
    // A missing or failing native picker must never take the profile down.
    return null;
  }
}
