/**
 * Local run persistence.
 *
 * Runs are stored as one JSON file each under `runs/` in the app's document
 * directory. One file per run means saving never rewrites earlier runs, so a
 * process kill mid-write can damage at most the run being written.
 *
 * No backend, no auth, no sync. `expo-file-system` already ships with the
 * project, so this adds no dependency.
 */

import { Directory, File, Paths } from 'expo-file-system';

import type { Coordinate, RouteCandidate } from './routing';
import type { RunStatus, SavedRun } from './run-session';

const RUNS_DIRECTORY = 'runs';

/** ~1.1 m precision. Full float precision would triple the file for no benefit. */
const COORDINATE_DECIMALS = 5;

function runsDirectory(): Directory {
  return new Directory(Paths.document, RUNS_DIRECTORY);
}

function ensureDirectory(): Directory {
  const directory = runsDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  return directory;
}

function roundCoordinate({ latitude, longitude }: Coordinate): Coordinate {
  const factor = 10 ** COORDINATE_DECIMALS;
  return {
    latitude: Math.round(latitude * factor) / factor,
    longitude: Math.round(longitude * factor) / factor,
  };
}

function isCoordinate(value: unknown): value is Coordinate {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { latitude, longitude } = value as Coordinate;
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function parseCoordinates(value: unknown): Coordinate[] {
  return Array.isArray(value) ? value.filter(isCoordinate) : [];
}

/**
 * Fix times come back as `(number | null)[]`, index-aligned with coordinates.
 * Anything non-numeric becomes `null` (unknown) rather than being dropped, so
 * the alignment the split math relies on is never silently broken.
 */
function parseTimestamps(value: unknown): (number | null)[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((entry) =>
    typeof entry === 'number' && Number.isFinite(entry) ? entry : null,
  );
}

function parseRoute(value: unknown): RouteCandidate | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const route = value as Partial<RouteCandidate>;
  const geometry = parseCoordinates(route.geometry);
  if (typeof route.id !== 'string' || geometry.length < 2) {
    return null;
  }
  return {
    id: route.id,
    distanceKm: Number.isFinite(route.distanceKm) ? (route.distanceKm as number) : 0,
    estimatedMinutes: Number.isFinite(route.estimatedMinutes)
      ? (route.estimatedMinutes as number)
      : 0,
    geometry,
    characteristics: Array.isArray(route.characteristics)
      ? route.characteristics.filter((entry): entry is string => typeof entry === 'string')
      : [],
    ascentMeters: Number.isFinite(route.ascentMeters) ? route.ascentMeters : undefined,
  };
}

/**
 * Rebuild a run from parsed JSON, rejecting anything structurally unusable.
 * A corrupt or hand-edited file is skipped rather than crashing History.
 */
function parseRun(value: unknown): SavedRun | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const run = value as Partial<SavedRun>;
  if (typeof run.id !== 'string' || !Number.isFinite(run.startedAt)) {
    return null;
  }

  const status: RunStatus =
    run.status === 'active' || run.status === 'paused' || run.status === 'finished'
      ? run.status
      : 'finished';

  return {
    id: run.id,
    startedAt: run.startedAt as number,
    endedAt: Number.isFinite(run.endedAt) ? (run.endedAt as number) : (run.startedAt as number),
    route: parseRoute(run.route),
    targetDistanceKm: Number.isFinite(run.targetDistanceKm) ? (run.targetDistanceKm as number) : 0,
    distanceKm: Number.isFinite(run.distanceKm) ? (run.distanceKm as number) : 0,
    durationSeconds: Number.isFinite(run.durationSeconds) ? (run.durationSeconds as number) : 0,
    averagePaceMinPerKm: Number.isFinite(run.averagePaceMinPerKm)
      ? (run.averagePaceMinPerKm as number)
      : null,
    coordinates: parseCoordinates(run.coordinates),
    timestamps: parseTimestamps(run.timestamps),
    status,
    shoeId: typeof run.shoeId === 'string' && run.shoeId.length > 0 ? run.shoeId : undefined,
  };
}

function roundedPayload(run: SavedRun): SavedRun {
  return {
    ...run,
    coordinates: run.coordinates.map(roundCoordinate),
    route: run.route
      ? { ...run.route, geometry: run.route.geometry.map(roundCoordinate) }
      : null,
  };
}

export async function saveRun(run: SavedRun): Promise<void> {
  const directory = ensureDirectory();
  const file = new File(directory, `${run.id}.json`);
  const payload = roundedPayload(run);

  if (!file.exists) {
    file.create();
  }
  file.write(JSON.stringify(payload));
}

/** All saved runs, newest first. Unreadable files are skipped. */
export async function listRuns(): Promise<SavedRun[]> {
  const directory = runsDirectory();
  if (!directory.exists) {
    return [];
  }

  const runs: SavedRun[] = [];
  for (const entry of directory.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith('.json')) {
      continue;
    }
    try {
      const parsed = parseRun(JSON.parse(await entry.text()));
      if (parsed) {
        runs.push(parsed);
      }
    } catch {
      // A damaged file must not take History down with it.
      continue;
    }
  }

  return runs.sort((a, b) => b.startedAt - a.startedAt);
}

export async function getRun(id: string): Promise<SavedRun | null> {
  const file = new File(runsDirectory(), `${id}.json`);
  if (!file.exists) {
    return null;
  }
  try {
    return parseRun(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}

export async function deleteRun(id: string): Promise<void> {
  const file = new File(runsDirectory(), `${id}.json`);
  if (file.exists) {
    file.delete();
  }
}

const IN_PROGRESS_FILE = 'in-progress-run.json';

/**
 * Kept outside `runs/` — a fixed filename, not one-per-run — so an
 * in-progress checkpoint never shows up in `listRuns()` and never needs a
 * status filter applied at every call site that reads History.
 */
function inProgressFile(): File {
  return new File(Paths.document, IN_PROGRESS_FILE);
}

/** Overwrites the single in-progress checkpoint. Caller controls frequency. */
export async function checkpointRun(run: SavedRun): Promise<void> {
  const file = inProgressFile();
  const payload = roundedPayload(run);
  if (!file.exists) {
    file.create();
  }
  file.write(JSON.stringify(payload));
}

/** The run that was active/paused when the app last stopped running, if any. */
export async function getInProgressRun(): Promise<SavedRun | null> {
  const file = inProgressFile();
  if (!file.exists) {
    return null;
  }
  try {
    return parseRun(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}

export async function clearInProgressRun(): Promise<void> {
  const file = inProgressFile();
  if (file.exists) {
    file.delete();
  }
}
