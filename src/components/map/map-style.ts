/**
 * ROAM's own Mapbox basemap, authored in code (#152).
 *
 * The default Mapbox Light/Dark styles are colourful and label-heavy, the
 * opposite of the product's "grayscale map, lime route" intent. Rather than
 * depend on a Mapbox Studio style that must be maintained out of band, the
 * Minimal variant is generated from the same `map-palette.ts` the route and
 * markers already use, so light and dark are two deliberate designs sharing one
 * hierarchy: quiet land, near-neutral water and parks, a three-step road ramp,
 * buildings as texture, and a minimal label set with no POIs.
 *
 * The style is a Mapbox GL style spec object, serialised to the string
 * `MapView` expects via `styleJSON`. It is deliberately small: only the layers
 * the app actually reads. See docs/map-style-redesign.md.
 */

import type { MapColors } from './map-palette';

const STREETS_SOURCE = 'mapbox://mapbox.mapbox-streets-v8';
const GLYPHS = 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf';
const TEXT_FONT = ['DIN Pro Medium', 'Arial Unicode MS Regular'];

/** Road classes grouped into the three-step ramp. */
const MOTORWAY_CLASSES = ['motorway', 'motorway_link', 'trunk', 'trunk_link'];
const MAJOR_CLASSES = [
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
];
const MINOR_CLASSES = ['street', 'street_limited', 'service', 'track', 'path', 'pedestrian'];

/** Parks, woods and other green context, as a single neutral tint. */
const PARK_CLASSES = [
  'park',
  'national_park',
  'cemetery',
  'golf_course',
  'grass',
  'wood',
  'scrub',
  'forest',
  'recreation_ground',
  'pitch',
];

function roadWidth(motorway: number, major: number, minor: number) {
  return {
    motorway: [
      'interpolate',
      ['linear'],
      ['zoom'],
      5,
      0.8 * motorway,
      9,
      2.5 * motorway,
      13,
      6 * motorway,
      17,
      16 * motorway,
    ],
    major: [
      'interpolate',
      ['linear'],
      ['zoom'],
      8,
      0.5 * major,
      12,
      1.5 * major,
      15,
      4 * major,
      18,
      12 * major,
    ],
    minor: [
      'interpolate',
      ['linear'],
      ['zoom'],
      12,
      0.3 * minor,
      14,
      1 * minor,
      16,
      2.5 * minor,
      18,
      7 * minor,
    ],
  };
}

/**
 * Build the Minimal basemap style for an appearance. Returns a JSON string
 * ready for `MapView`'s `styleJSON`.
 */
export function buildMinimalMapStyle(colors: MapColors): string {
  const width = roadWidth(1, 1, 1);

  const style = {
    version: 8,
    name: 'ROAM Minimal',
    glyphs: GLYPHS,
    sources: {
      streets: { type: 'vector', url: STREETS_SOURCE },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': colors.land },
      },
      {
        id: 'landuse-park',
        type: 'fill',
        source: 'streets',
        'source-layer': 'landuse',
        filter: ['match', ['get', 'class'], PARK_CLASSES, true, false],
        paint: { 'fill-color': colors.park },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'streets',
        'source-layer': 'water',
        paint: { 'fill-color': colors.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'streets',
        'source-layer': 'waterway',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colors.water, 'line-width': 1 },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'streets',
        'source-layer': 'building',
        minzoom: 13,
        paint: {
          'fill-color': colors.building,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.7, 16, 0.9],
        },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'streets',
        'source-layer': 'road',
        filter: ['match', ['get', 'class'], MINOR_CLASSES, true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colors.minorRoad, 'line-width': width.minor },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'streets',
        'source-layer': 'road',
        filter: ['match', ['get', 'class'], MAJOR_CLASSES, true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colors.majorRoad, 'line-width': width.major },
      },
      {
        id: 'road-motorway',
        type: 'line',
        source: 'streets',
        'source-layer': 'road',
        filter: ['match', ['get', 'class'], MOTORWAY_CLASSES, true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colors.motorway, 'line-width': width.motorway },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: 'streets',
        'source-layer': 'place_label',
        filter: ['match', ['get', 'type'], ['city', 'town', 'village'], true, false],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': TEXT_FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 14],
          'text-letter-spacing': 0.05,
        },
        paint: {
          'text-color': colors.label,
          'text-halo-color': colors.labelHalo,
          'text-halo-width': 1.2,
        },
      },
      {
        id: 'road-labels',
        type: 'symbol',
        source: 'streets',
        'source-layer': 'road_label',
        minzoom: 14,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': TEXT_FONT,
          'symbol-placement': 'line',
          'text-size': 11,
          'text-letter-spacing': 0.05,
        },
        paint: {
          'text-color': colors.label,
          'text-halo-color': colors.labelHalo,
          'text-halo-width': 1,
        },
      },
    ],
  };

  return JSON.stringify(style);
}
