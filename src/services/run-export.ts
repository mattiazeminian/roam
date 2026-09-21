/**
 * Exporting saved runs (#45).
 *
 * GPX is the portable format runners already expect, and it is the honest one
 * here: it carries exactly what Roam recorded — position and time — and nothing
 * Roam did not (no heart rate, no cadence, no elevation it never measured).
 *
 * Points without a known time are written without a `<time>` element rather
 * than with a guessed one, so an imported file never claims more precision than
 * the recording had.
 */

import { Directory, File, Paths } from 'expo-file-system';

import { formatRunDate, type SavedRun } from './run-session';

const EXPORT_FILE = 'roam-runs.gpx';

function isoOrNull(ms: number | null | undefined): string | null {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * One run as a GPX `<trk>`, or null when there is no track to write. A run
 * recorded without GPS is skipped rather than exported as an empty track.
 */
export function runToTrack(run: SavedRun): string | null {
  if (run.coordinates.length < 2) {
    return null;
  }

  const timestamps = run.timestamps ?? [];
  const points = run.coordinates.map((point, index) => {
    const time = isoOrNull(timestamps[index]);
    const stamp = time ? `<time>${time}</time>` : '';
    return `      <trkpt lat="${point.latitude}" lon="${point.longitude}">${stamp}</trkpt>`;
  });

  return [
    '  <trk>',
    `    <name>${formatRunDate(run.startedAt)}</name>`,
    '    <trkseg>',
    ...points,
    '    </trkseg>',
    '  </trk>',
  ].join('\n');
}

export type GpxDocument = {
  xml: string;
  /** Runs written as tracks. */
  exported: number;
  /** Runs with no usable track, omitted on purpose. */
  skipped: number;
};

/** A single GPX document holding one track per exportable run. */
export function toGpxDocument(runs: SavedRun[]): GpxDocument {
  const tracks: string[] = [];
  let skipped = 0;

  for (const run of runs) {
    const track = runToTrack(run);
    if (track) {
      tracks.push(track);
    } else {
      skipped += 1;
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Roam" xmlns="http://www.topografix.com/GPX/1/1">',
    ...tracks,
    '</gpx>',
    '',
  ].join('\n');

  return { xml, exported: tracks.length, skipped };
}

export type GpxExportResult = {
  uri: string;
  exported: number;
  skipped: number;
};

/** Writes the export to the app's document directory and returns its location. */
export async function writeRunsGpx(runs: SavedRun[]): Promise<GpxExportResult> {
  const { xml, exported, skipped } = toGpxDocument(runs);

  const directory = new Directory(Paths.document);
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }

  const file = new File(Paths.document, EXPORT_FILE);
  if (!file.exists) {
    file.create();
  }
  file.write(xml);

  return { uri: file.uri, exported, skipped };
}
