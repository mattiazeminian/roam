import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Button } from '@/components/button';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { useRoutes } from '@/services/route-context';
import { layout, spacing, useTheme } from '@/theme';

/** Long enough to read as deliberate work, short enough not to be a wait. */
const MIN_DURATION_MS = 3500;

/**
 * The ROAM mark traced from the brand PNG: a single closed stroke, a route that
 * ends where it began. Traced offline so the app can draw it as a path (no PNG
 * on screen, no raster scaling) and animate the stroke.
 */
const MARK_PATH =
  'M511 140 L543 142 L572 148 L605 167 L627 188 L641 208 L653 232 L669 281 L685 344 ' +
  'L692 362 L698 385 L711 415 L730 447 L754 481 L778 505 L809 532 L858 567 L885 589 ' +
  'L907 611 L923 633 L938 666 L943 687 L947 722 L944 748 L938 777 L926 804 L910 826 ' +
  'L892 844 L861 865 L826 877 L801 881 L775 881 L741 875 L717 865 L701 855 L679 836 ' +
  'L665 820 L649 796 L637 773 L602 692 L585 659 L575 644 L554 621 L540 610 L520 600 ' +
  'L506 596 L479 592 L466 593 L434 599 L428 603 L413 607 L389 620 L345 648 L309 675 ' +
  'L261 706 L224 725 L203 730 L181 733 L166 733 L134 727 L110 713 L95 697 L87 684 ' +
  'L84 677 L79 646 L81 615 L88 589 L105 560 L138 527 L218 463 L256 424 L256 422 ' +
  'L273 402 L294 365 L310 341 L344 275 L367 237 L384 212 L404 188 L428 167 L460 149 ' +
  'L478 144 L510 141 Z';
/** The path's length in viewBox units, for the dash trace. */
const MARK_LENGTH = 2662;
/** The traced stroke is as thick as the brand PNG's. */
const MARK_STROKE = 54;
const MARK_SIZE = 128;

/**
 * What the search is "thinking", in runner language. Flavour, not a checklist:
 * the search is a single call, so these never claim a step or a percentage.
 */
const PHRASES = [
  'Thinking…',
  'Scouting quiet streets…',
  'Avoiding the steep bits…',
  'Hunting for a nice loop…',
  'Counting the corners…',
  'Hmm, not that street…',
  'Making sure you come back to where you started…',
  'Almost there…',
];
const PHRASE_MS = 1200;

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Generating — the moment a route is built.
 *
 * The search is already running when this opens; this screen exists so that
 * three seconds of work is a considered moment rather than a frozen button. The
 * brand mark — a route that ends where it began — draws itself in the emphasis
 * ink over a faint outline, while a line of "thinking" copy cycles. There is
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
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  // The "thinking" copy cycles while the search runs; Reduce Motion holds one.
  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    const timer = setInterval(
      () => setPhraseIndex((index) => (index + 1) % PHRASES.length),
      PHRASE_MS,
    );
    return () => clearInterval(timer);
  }, [reduceMotion]);

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
  const phrase = PHRASES[reduceMotion ? 0 : phraseIndex];

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.background, paddingTop: insets.top + spacing.xs },
      ]}>
      {/* A runner who changes their mind, or whose search is taking too long,
          must not be stuck here until it succeeds or fails. */}
      <MapControl
        symbol="chevron.left"
        accessibilityLabel="Cancel and go back"
        onPress={() => router.back()}
      />

      <View style={styles.stage}>
        {!failed ? <Mark reduceMotion={reduceMotion} /> : null}
        <Text variant="display" style={styles.headline}>
          {failed ? 'That did not work' : 'Building your route'}
        </Text>
        {failed ? (
          <Text variant="body" color="textSecondary" style={styles.phrase}>
            {errorMessage ?? 'Roam could not find a route near you.'}
          </Text>
        ) : (
          <Animated.View
            key={phrase}
            entering={reduceMotion ? undefined : FadeIn.duration(280)}
            exiting={reduceMotion ? undefined : FadeOut.duration(160)}>
            <Text
              variant="body"
              color="textSecondary"
              accessibilityLiveRegion="polite"
              style={styles.phrase}>
              {phrase}
            </Text>
          </Animated.View>
        )}
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

/**
 * The brand mark drawing itself. A faint outline is always present; the accent
 * stroke traces it — the dash offset runs from the full length to zero, so the
 * route appears to be drawn. Reduce Motion shows it drawn and still.
 */
function Mark({ reduceMotion }: { reduceMotion: boolean }) {
  const theme = useTheme();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    // Draw, then start again: the route being laid down while the search runs.
    progress.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, [progress, reduceMotion]);

  const accentProps = useAnimatedProps(() => ({
    strokeDashoffset: MARK_LENGTH * (1 - progress.value),
  }));

  return (
    <Svg
      width={MARK_SIZE}
      height={MARK_SIZE}
      viewBox="0 0 1024 1024"
      style={styles.mark}
      accessibilityIgnoresInvertColors>
      <Path
        d={MARK_PATH}
        stroke={theme.track}
        strokeWidth={MARK_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <AnimatedPath
        d={MARK_PATH}
        stroke={theme.accentText}
        strokeWidth={MARK_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={`${MARK_LENGTH} ${MARK_LENGTH}`}
        animatedProps={accentProps}
      />
    </Svg>
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
    gap: spacing.sm,
  },
  mark: {
    marginBottom: spacing.lg,
  },
  headline: {
    textAlign: 'center',
  },
  phrase: {
    textAlign: 'center',
    maxWidth: 300,
  },
  actions: {
    gap: spacing.xs,
  },
});
