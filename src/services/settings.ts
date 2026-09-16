/**
 * User preferences.
 *
 * Only settings that change something ROAM actually does. Nothing here is
 * decorative, and nothing is stored that the app does not read back.
 */

import { Directory, File, Paths } from 'expo-file-system';

export type DistanceUnit = 'km' | 'mi';

export type Settings = {
  unit: DistanceUnit;
  /**
   * The runner's typical pace in minutes per kilometer. Route time estimates
   * are derived from it — the routing provider only returns a *walking*
   * duration, which badly overstates the time for a runner.
   */
  typicalPaceMinPerKm: number;
  /** Distance Home opens with. */
  defaultDistanceKm: number;
};

export const DEFAULT_SETTINGS: Settings = {
  unit: 'km',
  typicalPaceMinPerKm: 6.6,
  defaultDistanceKm: 5,
};

export const MIN_PACE_MIN_PER_KM = 3;
export const MAX_PACE_MIN_PER_KM = 12;

const METERS_PER_MILE = 1609.344;

const SETTINGS_FILE = 'settings.json';

function settingsFile(): File {
  return new File(Paths.document, SETTINGS_FILE);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Rebuild settings from parsed JSON, falling back per-field. */
function parseSettings(value: unknown): Settings {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_SETTINGS;
  }
  const raw = value as Partial<Settings>;
  return {
    unit: raw.unit === 'mi' ? 'mi' : 'km',
    typicalPaceMinPerKm: Number.isFinite(raw.typicalPaceMinPerKm)
      ? clamp(raw.typicalPaceMinPerKm as number, MIN_PACE_MIN_PER_KM, MAX_PACE_MIN_PER_KM)
      : DEFAULT_SETTINGS.typicalPaceMinPerKm,
    defaultDistanceKm: Number.isFinite(raw.defaultDistanceKm)
      ? clamp(raw.defaultDistanceKm as number, 1, 42)
      : DEFAULT_SETTINGS.defaultDistanceKm,
  };
}

export async function loadSettings(): Promise<Settings> {
  const file = settingsFile();
  if (!file.exists) {
    return DEFAULT_SETTINGS;
  }
  try {
    return parseSettings(JSON.parse(await file.text()));
  } catch {
    // A damaged file must not stop the app from starting.
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const directory = new Directory(Paths.document);
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  const file = settingsFile();
  if (!file.exists) {
    file.create();
  }
  file.write(JSON.stringify(settings));
}

// -- Unit conversion -------------------------------------------------------
// Distances are stored and computed in metric everywhere; imperial exists only
// at the point of display, so there is one source of truth for the numbers.

export function metersToDisplay(meters: number, unit: DistanceUnit): number {
  return unit === 'mi' ? meters / METERS_PER_MILE : meters / 1000;
}

export function kmToDisplay(km: number, unit: DistanceUnit): number {
  return unit === 'mi' ? (km * 1000) / METERS_PER_MILE : km;
}

export function displayToKm(value: number, unit: DistanceUnit): number {
  return unit === 'mi' ? (value * METERS_PER_MILE) / 1000 : value;
}

/** Pace is per kilometer internally; per mile takes longer for the same speed. */
export function paceToDisplay(minPerKm: number, unit: DistanceUnit): number {
  return unit === 'mi' ? minPerKm * (METERS_PER_MILE / 1000) : minPerKm;
}

export function paceFromDisplay(minPerUnit: number, unit: DistanceUnit): number {
  return unit === 'mi' ? minPerUnit / (METERS_PER_MILE / 1000) : minPerUnit;
}

export function distanceUnitLabel(unit: DistanceUnit): string {
  return unit === 'mi' ? 'mi' : 'km';
}

export function distanceUnitSpoken(unit: DistanceUnit): string {
  return unit === 'mi' ? 'miles' : 'kilometers';
}

/** Presets offered on Home, in the unit being displayed. */
export function distancePresets(unit: DistanceUnit): number[] {
  return unit === 'mi' ? [2, 3, 5, 8] : [3, 5, 7, 10];
}
