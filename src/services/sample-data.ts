/**
 * Sample data for development (#112, profile).
 *
 * The screens cannot be judged while they are empty. This fills a fresh install
 * with plausible running history, a name and an avatar, and a few pairs of
 * shoes — **only** in development, and **only** when there is nothing there
 * already, so it can never overwrite real data.
 *
 * Everything here is invented. The names are not real people, the avatar is a
 * placeholder service, and the runs are generated. It exists so the interface
 * can be evaluated, and deleting the app's data removes it completely.
 */

import { loadProfile, saveProfile, type Profile } from './profile';
import { listRuns, saveRun } from './run-storage';
import { createShoe, loadShoes, saveShoes } from './shoes';
import type { Coordinate } from './routing';
import type { SavedRun } from './run-session';

const FIRST_NAMES = ['Marta', 'Jonas', 'Amara', 'Theo', 'Lena', 'Ravi', 'Sofia', 'Noah', 'Ines', 'Kai'];
const LAST_NAMES = ['Bianchi', 'Novak', 'Okafor', 'Lindqvist', 'Haddad', 'Moreau', 'Petrov', 'Silva'];

/** The sample runner starts here — Midtown, the same place the map opens. */
const BASE: Coordinate = { latitude: 40.7484, longitude: -73.9857 };
const METERS_PER_DEGREE_LAT = 111_320;
const DAY_MS = 86_400_000;

function randomOf<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function offset(northMeters: number, eastMeters: number): Coordinate {
  return {
    latitude: BASE.latitude + northMeters / METERS_PER_DEGREE_LAT,
    longitude:
      BASE.longitude +
      eastMeters / (METERS_PER_DEGREE_LAT * Math.cos((BASE.latitude * Math.PI) / 180)),
  };
}

/** A closed, roughly rectangular loop of `count` points around the base. */
function loopGeometry(radiusMeters: number, count = 24): Coordinate[] {
  const points: Coordinate[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    points.push(
      offset(Math.sin(angle) * radiusMeters, Math.cos(angle) * radiusMeters * 0.75),
    );
  }
  points.push(points[0]);
  return points;
}

function buildRun(daysAgo: number, distanceKm: number, paceMinPerKm: number): SavedRun {
  const startedAt = Date.now() - daysAgo * DAY_MS + 7 * 3_600_000;
  const durationSeconds = Math.round(distanceKm * paceMinPerKm * 60);
  const geometry = loopGeometry(Math.max(120, (distanceKm * 1000) / 6));
  // Roughly even spacing along the run.
  const timestamps = geometry.map((_, index) =>
    startedAt + Math.round((index / (geometry.length - 1)) * durationSeconds * 1000),
  );

  return {
    id: `sample-${daysAgo}-${Math.round(distanceKm * 10)}`,
    startedAt,
    endedAt: startedAt + durationSeconds * 1000,
    route: null,
    targetDistanceKm: distanceKm,
    distanceKm,
    durationSeconds,
    averagePaceMinPerKm: paceMinPerKm,
    coordinates: geometry,
    timestamps,
    status: 'finished',
  };
}

/**
 * A believable eight weeks: a long run at the weekend, easy runs midweek, a
 * taper-and-build shape rather than a flat line, and a couple of missed days.
 */
async function sampleRuns(): Promise<SavedRun[]> {
  const runs: SavedRun[] = [];
  for (let week = 0; week < 8; week += 1) {
    const build = 1 + (week % 4) * 0.08; // gentle build, then a step back
    for (const [weekday, baseKm, pace] of [
      [1, 6, 5.8],
      [3, 8, 5.4],
      [6, 11, 6.1],
    ] as const) {
      if (week % 4 === 3 && weekday === 3) {
        continue; // one skipped session every fourth week
      }
      const daysAgo = week * 7 + (6 - weekday);
      const distanceKm = Math.round(baseKm * build * 10) / 10;
      runs.push(buildRun(daysAgo, distanceKm, pace));
    }
  }
  return runs;
}

let seeded = false;

/**
 * Seed a fresh install. Development only; never touches existing data.
 * Returns true when it seeded.
 */
export async function seedSampleDataIfEmpty(): Promise<boolean> {
  if (!__DEV__ || seeded) {
    return false;
  }

  const [runs, profile, shoes] = await Promise.all([listRuns(), loadProfile(), loadShoes()]);
  const hasData = runs.length > 0 || profile.name !== null || shoes.length > 0;
  if (hasData) {
    return false;
  }

  seeded = true;

  const profileWithName: Profile = {
    ...profile,
    name: `${randomOf(FIRST_NAMES)} ${randomOf(LAST_NAMES)}`,
    // A placeholder avatar service; not a real photograph of anyone.
    avatarUri: `https://i.pravatar.cc/256?img=${Math.floor(Math.random() * 60) + 1}`,
  };
  await saveProfile(profileWithName);

  await saveShoes([
    createShoe({ brand: 'Brooks', model: 'Ghost 16', nickname: 'daily pair' }),
    createShoe({ brand: 'Hoka', model: 'Speedgoat 6' }),
    createShoe({ brand: 'Nike', model: 'Vaporfly 3', nickname: 'race day' }),
  ]);

  for (const run of await sampleRuns()) {
    await saveRun(run);
  }

  return true;
}
