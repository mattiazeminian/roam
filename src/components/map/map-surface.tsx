import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';

import { useMapPalette } from './map-palette';

/**
 * Structurally faithful map placeholder.
 *
 * There is no map provider installed yet, so this draws a restrained abstract
 * street surface in the correct area: neutral land, subtle buildings, light
 * minor roads, a slightly stronger major road, and a couple of quiet labels.
 * It is a geographic surface, not a UI card. Route overlays render on top.
 */
export function MapSurface({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const map = useMapPalette();

  return (
    <View style={[styles.root, { backgroundColor: map.land }, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {BUILDINGS.map((building, index) => (
          <View
            key={`building-${index}`}
            style={[
              styles.building,
              {
                backgroundColor: map.building,
                left: building.left,
                top: building.top,
                width: building.width,
                height: building.height,
              },
            ]}
          />
        ))}

        {MINOR_VERTICAL.map((left) => (
          <View
            key={`v-${left}`}
            style={[styles.minorVertical, { backgroundColor: map.minorRoad, left }]}
          />
        ))}
        {MINOR_HORIZONTAL.map((top) => (
          <View
            key={`h-${top}`}
            style={[styles.minorHorizontal, { backgroundColor: map.minorRoad, top }]}
          />
        ))}

        <View style={[styles.majorVertical, { backgroundColor: map.majorRoad }]} />
        <View style={[styles.majorDiagonal, { backgroundColor: map.majorRoad }]} />

        {LABELS.map((label) => (
          <Text
            key={label.text}
            variant="caption"
            style={[styles.label, { color: map.label, left: label.left, top: label.top }]}>
            {label.text}
          </Text>
        ))}
      </View>

      {children}
    </View>
  );
}

const MINOR_VERTICAL = ['12%', '36%', '62%', '86%'] as const;
const MINOR_HORIZONTAL = ['16%', '42%', '68%'] as const;

const BUILDINGS = [
  { left: '15%', top: '19%', width: '17%', height: '18%' },
  { left: '39%', top: '19%', width: '19%', height: '18%' },
  { left: '65%', top: '19%', width: '17%', height: '18%' },
  { left: '15%', top: '45%', width: '17%', height: '20%' },
  { left: '39%', top: '45%', width: '19%', height: '20%' },
  { left: '65%', top: '45%', width: '17%', height: '20%' },
  { left: '15%', top: '71%', width: '17%', height: '16%' },
  { left: '65%', top: '71%', width: '17%', height: '16%' },
] as const;

const LABELS = [
  { text: 'PRAÇA DO NORTE', left: '40%', top: '31%' },
  { text: 'RUA DO SOL', left: '16%', top: '62%' },
] as const;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  building: {
    position: 'absolute',
  },
  minorVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
  },
  minorHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  majorVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '52%',
    width: 2,
  },
  majorDiagonal: {
    position: 'absolute',
    left: '-10%',
    top: '60%',
    width: '120%',
    height: 2,
    transform: [{ rotate: '-16deg' }],
  },
  label: {
    position: 'absolute',
    textTransform: 'uppercase',
  },
});
