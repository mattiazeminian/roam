/**
 * Local saved-route persistence.
 *
 * Mirrors `run-storage.ts`: one JSON file per route under `routes/` in the
 * document directory, so saving never rewrites other routes and a process kill
 * mid-write can damage at most the route being written. `expo-file-system`
 * already ships with the project, so this adds no dependency.
 *
 * The filename is the route's identity (`route-identity.ts`), which is what
 * makes saving the same loop twice an overwrite rather than a duplicate.
 */

import { Directory, File, Paths } from 'expo-file-system';

import { routeIdentity } from './route-identity';
import type { Coordinate, RouteCandidate } from './routing';

const ROUTES_DIRECTORY = 'routes';

/** Matches `run-storage.ts`, so a geometry read back is the one that was saved. */
const COORDINATE_DECIMALS = 5;

export type SavedRoute = {
  /** The route's identity — also its filename. */
  id: string;
  /** Epoch milliseconds, when it was first saved. */
  savedAt: number;
  route: RouteCandidate;
};

function routesDirectory(): Directory {
  return new Directory(Paths.document, ROUTES_DIRECTORY);
}

function ensureDirectory(): Directory {
  const directory = routesDirectory();
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

function parseRoute(value: unknown): RouteCandidate | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const route = value as Partial<RouteCandidate>;
  const geometry = Array.isArray(route.geometry) ? route.geometry.filter(isCoordinate) : [];
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

/** Rejects a corrupt or hand-edited file rather than crashing the list. */
function parseSavedRoute(value: unknown): SavedRoute | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const saved = value as Partial<SavedRoute>;
  if (typeof saved.id !== 'string') {
    return null;
  }
  const route = parseRoute(saved.route);
  if (!route) {
    return null;
  }
  return {
    id: saved.id,
    savedAt: Number.isFinite(saved.savedAt) ? (saved.savedAt as number) : 0,
    route,
  };
}

/**
 * Saves a route under its identity. Re-saving the same loop overwrites the
 * existing file (keeping its original `savedAt`), so there is never a duplicate.
 */
export async function saveRoute(route: RouteCandidate): Promise<SavedRoute> {
  const id = routeIdentity(route);
  const existing = await getRoute(id);
  const saved: SavedRoute = {
    id,
    savedAt: existing?.savedAt ?? Date.now(),
    route: {
      ...route,
      geometry: route.geometry.map(roundCoordinate),
    },
  };

  const file = new File(ensureDirectory(), `${id}.json`);
  if (!file.exists) {
    file.create();
  }
  file.write(JSON.stringify(saved));
  return saved;
}

/** All saved routes, newest first. Unreadable files are skipped. */
export async function listRoutes(): Promise<SavedRoute[]> {
  const directory = routesDirectory();
  if (!directory.exists) {
    return [];
  }

  const routes: SavedRoute[] = [];
  for (const entry of directory.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith('.json')) {
      continue;
    }
    try {
      const parsed = parseSavedRoute(JSON.parse(await entry.text()));
      if (parsed) {
        routes.push(parsed);
      }
    } catch {
      // A damaged file must not take the list down with it.
      continue;
    }
  }

  return routes.sort((a, b) => b.savedAt - a.savedAt);
}

export async function getRoute(id: string): Promise<SavedRoute | null> {
  const file = new File(routesDirectory(), `${id}.json`);
  if (!file.exists) {
    return null;
  }
  try {
    return parseSavedRoute(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}

export async function deleteRoute(id: string): Promise<void> {
  const file = new File(routesDirectory(), `${id}.json`);
  if (file.exists) {
    file.delete();
  }
}

/** Whether this exact route is already saved. */
export async function isRouteSaved(route: RouteCandidate): Promise<boolean> {
  return (await getRoute(routeIdentity(route))) !== null;
}
