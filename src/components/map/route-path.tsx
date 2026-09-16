import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { Point } from './projection';

export type RoutePathProps = {
  points: Point[];
  inactiveColor: string;
  activeColor: string;
  haloColor: string;
  baseWidth: number;
  activeWidth: number;
  baseOpacity: number;
  activeOpacity: number;
  selected: boolean;
  /** Draw the route progressively on mount. */
  draw?: boolean;
  drawDelayMs?: number;
  onPress?: () => void;
};

type SegmentGeometry = {
  key: string;
  a: Point;
  b: Point;
  length: number;
  angle: number;
  ux: number;
  uy: number;
  startFraction: number;
  endFraction: number;
};

type JointGeometry = {
  key: string;
  point: Point;
  fraction: number;
};

function buildGeometry(points: Point[]) {
  const segments: SegmentGeometry[] = [];
  const lengths: number[] = [];
  let total = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    lengths.push(length);
    total += length;
  }

  const safeTotal = total || 1;
  let accumulated = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const length = lengths[i];
    const ux = length === 0 ? 0 : (b.x - a.x) / length;
    const uy = length === 0 ? 0 : (b.y - a.y) / length;
    const startFraction = accumulated / safeTotal;
    accumulated += length;

    segments.push({
      key: `${i}`,
      a,
      b,
      length,
      angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      ux,
      uy,
      startFraction,
      endFraction: accumulated / safeTotal,
    });
  }

  const joints: JointGeometry[] = points.map((point, index) => ({
    key: `joint-${index}`,
    point,
    fraction: index === 0 ? 0 : (segments[index - 1]?.endFraction ?? 1),
  }));

  return { segments, joints };
}

function visibleLength(segment: SegmentGeometry, progress: number) {
  'worklet';
  const span = segment.endFraction - segment.startFraction;
  const local = span <= 0 ? 1 : Math.max(0, Math.min(1, (progress - segment.startFraction) / span));
  return segment.length * local;
}

function RouteSegment({
  segment,
  progress,
  emphasis,
  inactiveColor,
  activeColor,
  baseWidth,
  activeWidth,
  baseOpacity,
  activeOpacity,
}: {
  segment: SegmentGeometry;
  progress: SharedValue<number>;
  emphasis: SharedValue<number>;
  inactiveColor: string;
  activeColor: string;
  baseWidth: number;
  activeWidth: number;
  baseOpacity: number;
  activeOpacity: number;
}) {
  const style = useAnimatedStyle(() => {
    const visible = visibleLength(segment, progress.value);
    const endX = segment.a.x + segment.ux * visible;
    const endY = segment.a.y + segment.uy * visible;
    const width = baseWidth + (activeWidth - baseWidth) * emphasis.value;

    return {
      position: 'absolute',
      left: (segment.a.x + endX) / 2 - visible / 2,
      top: (segment.a.y + endY) / 2 - width / 2,
      width: visible,
      height: width,
      backgroundColor: interpolateColor(emphasis.value, [0, 1], [inactiveColor, activeColor]),
      opacity: baseOpacity + (activeOpacity - baseOpacity) * emphasis.value,
      transform: [{ rotate: `${segment.angle}deg` }],
    };
  });

  return <Animated.View pointerEvents="none" style={style} />;
}

function RouteJoint({
  joint,
  progress,
  emphasis,
  inactiveColor,
  activeColor,
  baseWidth,
  activeWidth,
  baseOpacity,
  activeOpacity,
}: {
  joint: JointGeometry;
  progress: SharedValue<number>;
  emphasis: SharedValue<number>;
  inactiveColor: string;
  activeColor: string;
  baseWidth: number;
  activeWidth: number;
  baseOpacity: number;
  activeOpacity: number;
}) {
  const style = useAnimatedStyle(() => {
    const reached = progress.value + 0.0001 >= joint.fraction ? 1 : 0;
    const width = baseWidth + (activeWidth - baseWidth) * emphasis.value;
    const opacity = (baseOpacity + (activeOpacity - baseOpacity) * emphasis.value) * reached;

    return {
      position: 'absolute',
      left: joint.point.x - width / 2,
      top: joint.point.y - width / 2,
      width,
      height: width,
      backgroundColor: interpolateColor(emphasis.value, [0, 1], [inactiveColor, activeColor]),
      opacity,
    };
  });

  return <Animated.View pointerEvents="none" style={style} />;
}

function RouteHaloSegment({
  segment,
  progress,
  emphasis,
  haloColor,
  haloWidth,
}: {
  segment: SegmentGeometry;
  progress: SharedValue<number>;
  emphasis: SharedValue<number>;
  haloColor: string;
  haloWidth: number;
}) {
  const style = useAnimatedStyle(() => {
    const visible = visibleLength(segment, progress.value);
    const endX = segment.a.x + segment.ux * visible;
    const endY = segment.a.y + segment.uy * visible;

    return {
      position: 'absolute',
      left: (segment.a.x + endX) / 2 - visible / 2,
      top: (segment.a.y + endY) / 2 - haloWidth / 2,
      width: visible,
      height: haloWidth,
      backgroundColor: haloColor,
      opacity: emphasis.value * 0.95,
      transform: [{ rotate: `${segment.angle}deg` }],
    };
  });

  return <Animated.View pointerEvents="none" style={style} />;
}

function RouteHaloJoint({
  joint,
  progress,
  emphasis,
  haloColor,
  haloWidth,
}: {
  joint: JointGeometry;
  progress: SharedValue<number>;
  emphasis: SharedValue<number>;
  haloColor: string;
  haloWidth: number;
}) {
  const style = useAnimatedStyle(() => {
    const reached = progress.value + 0.0001 >= joint.fraction ? 1 : 0;

    return {
      position: 'absolute',
      left: joint.point.x - haloWidth / 2,
      top: joint.point.y - haloWidth / 2,
      width: haloWidth,
      height: haloWidth,
      backgroundColor: haloColor,
      opacity: emphasis.value * 0.95 * reached,
    };
  });

  return <Animated.View pointerEvents="none" style={style} />;
}

/**
 * Draws a polyline without a drawing library. Segments are rotated squares;
 * the visible portion is animated along the geometry so a route draws itself in.
 * The selected route interpolates from neutral to the accent.
 */
export function RoutePath({
  points,
  inactiveColor,
  activeColor,
  haloColor,
  baseWidth,
  activeWidth,
  baseOpacity,
  activeOpacity,
  selected,
  draw = true,
  drawDelayMs = 0,
  onPress,
}: RoutePathProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(draw ? 0 : 1);
  const emphasis = useSharedValue(selected ? 1 : 0);
  const { segments, joints } = useMemo(() => buildGeometry(points), [points]);

  useEffect(() => {
    // Reduce Motion: show the final route immediately instead of drawing it in.
    if (draw && !reduceMotion) {
      progress.value = 0;
      progress.value = withDelay(
        drawDelayMs,
        withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      progress.value = 1;
    }
  }, [draw, drawDelayMs, progress, reduceMotion]);

  useEffect(() => {
    emphasis.value = withTiming(selected ? 1 : 0, {
      duration: reduceMotion ? 0 : 220,
      easing: Easing.out(Easing.quad),
    });
  }, [selected, emphasis, reduceMotion]);

  const haloWidth = activeWidth + 4;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {selected ? (
        <>
          {segments.map((segment) => (
            <RouteHaloSegment
              key={`halo-${segment.key}`}
              segment={segment}
              progress={progress}
              emphasis={emphasis}
              haloColor={haloColor}
              haloWidth={haloWidth}
            />
          ))}
          {joints.map((joint) => (
            <RouteHaloJoint
              key={`halo-${joint.key}`}
              joint={joint}
              progress={progress}
              emphasis={emphasis}
              haloColor={haloColor}
              haloWidth={haloWidth}
            />
          ))}
        </>
      ) : null}

      {segments.map((segment) => (
        <RouteSegment
          key={`line-${segment.key}`}
          segment={segment}
          progress={progress}
          emphasis={emphasis}
          inactiveColor={inactiveColor}
          activeColor={activeColor}
          baseWidth={baseWidth}
          activeWidth={activeWidth}
          baseOpacity={baseOpacity}
          activeOpacity={activeOpacity}
        />
      ))}
      {joints.map((joint) => (
        <RouteJoint
          key={`line-${joint.key}`}
          joint={joint}
          progress={progress}
          emphasis={emphasis}
          inactiveColor={inactiveColor}
          activeColor={activeColor}
          baseWidth={baseWidth}
          activeWidth={activeWidth}
          baseOpacity={baseOpacity}
          activeOpacity={activeOpacity}
        />
      ))}

      {onPress ? (
        // Pointer-only hit area. Accessible route controls live in the
        // selection list, so this layer is hidden from assistive technology.
        <View
          style={StyleSheet.absoluteFill}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {segments.map((segment) => (
            <Pressable
              key={`hit-${segment.key}`}
              onPress={onPress}
              style={{
                position: 'absolute',
                left: (segment.a.x + segment.b.x) / 2 - segment.length / 2,
                top: (segment.a.y + segment.b.y) / 2 - 22,
                width: segment.length,
                height: 44,
                transform: [{ rotate: `${segment.angle}deg` }],
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
