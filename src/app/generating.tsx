import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { useRoutes } from '@/services/route-context';
import { layout, spacing, useTheme } from '@/theme';

/** Long enough to read as deliberate work, short enough not to be a wait. */
const MIN_DURATION_MS = 3500;

/** The route that draws itself while the search runs. */
const TRACE_WIDTH = 300;
const TRACE_HEIGHT = 120;
const TRACE_THICKNESS = 4;
const TRACE_SEGMENTS = 24;
const TRACE_DOT = 9;
/** How far behind the leading dot each segment fades in, as a fraction of the loop. */
const TRACE_REVEAL = 0.14;

/**
 * A closed loop the dot runs around — a route that ends where it began, not a
 * line with an end. The wobble keeps it from reading as a perfect circle: a
 * little irregular, like a real loop picked out of the street grid.
 */
const TRACE_XS: number[] = [];
const TRACE_YS: number[] = [];
for (let i = 0; i <= TRACE_SEGMENTS; i += 1) {
  const t = i / TRACE_SEGMENTS;
  const angle = t * Math.PI * 2;
  const rx = (TRACE_WIDTH / 2 - 14) * (1 + 0.12 * Math.sin(t * Math.PI * 6));
  const ry = (TRACE_HEIGHT / 2 - 14) * (1 + 0.1 * Math.sin(t * Math.PI * 4 + 1.2));
  TRACE_XS.push(TRACE_WIDTH / 2 + rx * Math.cos(angle));
  TRACE_YS.push(TRACE_HEIGHT / 2 + ry * Math.sin(angle));
}

const TRACE_SEGMENTS_DATA = Array.from({ length: TRACE_SEGMENTS }, (_, i) => {
  const dx = TRACE_XS[i + 1] - TRACE_XS[i];
  const dy = TRACE_YS[i + 1] - TRACE_YS[i];
  const length = Math.hypot(dx, dy);
  const midX = (TRACE_XS[i] + TRACE_XS[i + 1]) / 2;
  const midY = (TRACE_YS[i] + TRACE_YS[i + 1]) / 2;
  return {
    length,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    left: midX - length / 2,
    top: midY - TRACE_THICKNESS / 2,
  };
});

/**
 * Generating — the moment a route is built.
 *
 * The search is already running when this opens; this screen exists so that
 * three seconds of work is a considered moment rather than a frozen button. The
 * route draws itself, closing into a loop, while the search runs; there is
 * deliberately no staged checklist or percentage, because the search is a
 * single call with no milestones to report honestly.
 */
export default function GeneratingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { status, errorMessage, retry } = useRoutes();
  const reduceMotion = useReducedMotion();

  const sawFinding = useRef(false);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status === 'finding') {
      sawFinding.current = true;
      return;
    }
    // Only hand over once this screen has seen its own search run, so arriving
    // with an old "ready" state cannot bounce straight through.
    if (status === 'ready' && sawFinding.current && minElapsed) {
      router.replace('/routes');
    }
  }, [status, minElapsed]);

  const failed = status === 'error';

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.background, paddingTop: insets.top + spacing.xl },
      ]}>
      <View style={styles.stage}>
        <Text variant="large" style={styles.headline}>
          {failed ? 'That did not work' : 'Building your route'}
        </Text>
        <Text variant="body" color="textSecondary" accessibilityLiveRegion="polite">
          {failed
            ? (errorMessage ?? 'ROAM could not find a route near you.')
            : 'Finding a route with fewer turns and useful paths.'}
        </Text>

        {!failed ? (
          <View style={styles.visual} accessibilityLabel="Route being drawn">
            <RouteTrace reduceMotion={reduceMotion} />
          </View>
        ) : null}
      </View>

      {failed ? (
        <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Button label="Try again" variant="accent" onPress={() => void retry()} />
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : (
        <View style={{ paddingBottom: insets.bottom + spacing.lg }} />
      )}
    </View>
  );
}

/** A lime route line tracing itself, led by a dot. Loops until the search ends. */
function RouteTrace({ reduceMotion }: { reduceMotion: boolean }) {
  const theme = useTheme();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, [progress, reduceMotion]);

  const dotStyle = useAnimatedStyle(() => {
    const scaled = progress.value * TRACE_SEGMENTS;
    const index = Math.min(TRACE_SEGMENTS - 1, Math.floor(scaled));
    const frac = scaled - index;
    const x = TRACE_XS[index] + (TRACE_XS[index + 1] - TRACE_XS[index]) * frac;
    const y = TRACE_YS[index] + (TRACE_YS[index + 1] - TRACE_YS[index]) * frac;
    return {
      transform: [{ translateX: x - TRACE_DOT / 2 }, { translateY: y - TRACE_DOT / 2 }],
    };
  });

  return (
    <View style={styles.trace}>
      {TRACE_SEGMENTS_DATA.map((segment, index) => (
        <TraceSegment
          key={index}
          index={index}
          segment={segment}
          progress={progress}
          reduceMotion={reduceMotion}
          color={theme.accent}
        />
      ))}
      <Animated.View style={[styles.dot, { backgroundColor: theme.accent }, dotStyle]} />
    </View>
  );
}

function TraceSegment({
  index,
  segment,
  progress,
  reduceMotion,
  color,
}: {
  index: number;
  segment: (typeof TRACE_SEGMENTS_DATA)[number];
  progress: { value: number };
  reduceMotion: boolean;
  color: string;
}) {
  const threshold = index / TRACE_SEGMENTS;
  const style = useAnimatedStyle(() => {
    const ahead = progress.value - threshold;
    const opacity = reduceMotion ? 1 : ahead <= 0 ? 0 : Math.min(1, ahead / TRACE_REVEAL);
    return { opacity };
  });

  return (
    <Animated.View
      style={[
        styles.segment,
        {
          left: segment.left,
          top: segment.top,
          width: segment.length,
          backgroundColor: color,
          transform: [{ rotate: `${segment.angle}deg` }],
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
    justifyContent: 'space-between',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  headline: {
    textAlign: 'center',
  },
  visual: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  trace: {
    width: TRACE_WIDTH,
    height: TRACE_HEIGHT,
  },
  segment: {
    position: 'absolute',
    height: TRACE_THICKNESS,
    borderRadius: TRACE_THICKNESS / 2,
  },
  dot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TRACE_DOT,
    height: TRACE_DOT,
    borderRadius: TRACE_DOT / 2,
  },
  actions: {
    gap: spacing.xs,
  },
});
