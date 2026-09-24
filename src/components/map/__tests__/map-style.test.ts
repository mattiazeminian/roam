/**
 * The Minimal basemap (#152).
 *
 * The style is generated rather than authored in Studio, so it is worth
 * pinning: it must stay valid JSON, use the appearance's own palette, keep the
 * route-dominant hierarchy (quiet water/parks, no POIs), and actually differ
 * between light and dark.
 */
import { describe, expect, test } from '@jest/globals';

import { darkMapPalette, lightMapPalette } from '../map-palette';
import { buildMinimalMapStyle } from '../map-style';

type Layer = {
  id: string;
  type: string;
  'source-layer'?: string;
  paint?: Record<string, unknown>;
};

function parse(palette: typeof lightMapPalette) {
  const style = JSON.parse(buildMinimalMapStyle(palette)) as {
    version: number;
    sources: Record<string, unknown>;
    layers: Layer[];
  };
  return style;
}

describe('buildMinimalMapStyle', () => {
  test('is a valid, self-contained vector style', () => {
    const style = parse(lightMapPalette);
    expect(style.version).toBe(8);
    expect(style.sources).toHaveProperty('streets');
    expect(style.layers.length).toBeGreaterThan(0);
  });

  test('draws the route-dominant hierarchy, with no POIs', () => {
    const ids = parse(lightMapPalette).layers.map((layer) => layer.id);
    expect(ids).toContain('background');
    expect(ids).toContain('water');
    expect(ids).toContain('road-motorway');
    expect(ids).toContain('road-major');
    expect(ids).toContain('road-minor');
    expect(ids).toContain('place-labels');
    expect(ids.some((id) => id.includes('poi'))).toBe(false);
  });

  test('paints from the appearance palette', () => {
    const style = parse(lightMapPalette);
    const background = style.layers.find((layer) => layer.id === 'background');
    const water = style.layers.find((layer) => layer.id === 'water');
    expect(background?.paint?.['background-color']).toBe(lightMapPalette.land);
    expect(water?.paint?.['fill-color']).toBe(lightMapPalette.water);
  });

  test('light and dark are different designs', () => {
    expect(buildMinimalMapStyle(lightMapPalette)).not.toBe(
      buildMinimalMapStyle(darkMapPalette),
    );
  });
});
