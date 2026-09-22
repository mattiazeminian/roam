import { HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

/**
 * The active run as a Live Activity (#149).
 *
 * This layout runs inside the widget extension, not the app, so it is a pure
 * function of the props it is given — no hooks, no app state, no clock. The app
 * pushes new props on a bounded cadence and on state changes; the activity only
 * renders what it is told.
 *
 * Everything the function needs must live inside it: the widget runtime does
 * not carry module-scope values across.
 */
export type RunActivityProps = {
  distanceKm: number;
  durationSeconds: number;
  /** Preformatted by the app, e.g. `5'42"/km`, or `—` when unknown. */
  paceLabel: string;
  state: 'active' | 'paused';
  /** e.g. "Tempo run", or null for a free run. */
  workoutLabel: string | null;
};

const RunActivity = (props: RunActivityProps, environment: LiveActivityEnvironment) => {
  'widget';

  const time = (() => {
    const total = Math.max(0, Math.floor(props.durationSeconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  })();

  const distance = props.distanceKm.toFixed(2);
  const paused = props.state === 'paused';
  const muted = environment.isLuminanceReduced ? '#B8BCB4' : '#8A8F86';
  const ink = '#F2F3EF';

  const label = paused ? 'Paused' : (props.workoutLabel ?? 'Free run');

  return {
    banner: (
      <VStack modifiers={[padding({ horizontal: 16, vertical: 14 })]}>
        <HStack>
          <Text modifiers={[font({ weight: 'bold', size: 13 }), foregroundStyle(muted)]}>ROAM</Text>
          <Text modifiers={[font({ weight: 'semibold', size: 13 }), foregroundStyle(muted)]}>{label}</Text>
        </HStack>
        <HStack>
          <Text modifiers={[font({ weight: 'bold', size: 40 }), foregroundStyle(ink)]}>{distance}</Text>
          <Text modifiers={[font({ weight: 'semibold', size: 18 }), foregroundStyle(muted)]}> km</Text>
        </HStack>
        <HStack>
          <Text modifiers={[font({ weight: 'semibold', size: 16 }), foregroundStyle(ink)]}>{time}</Text>
          <Text modifiers={[font({ weight: 'semibold', size: 16 }), foregroundStyle(muted)]}> · {props.paceLabel}</Text>
        </HStack>
      </VStack>
    ),
    compactLeading: <Image systemName="figure.run" color="#CDF24B" />,
    compactTrailing: (
      <Text modifiers={[font({ weight: 'bold', size: 14 }), foregroundStyle(ink)]}>{distance}</Text>
    ),
    minimal: <Image systemName={paused ? 'pause.fill' : 'figure.run'} color="#CDF24B" />,
    expandedLeading: (
      <Text modifiers={[font({ weight: 'bold', size: 22 }), foregroundStyle(ink)]}>{`${distance} km`}</Text>
    ),
    expandedTrailing: (
      <Text modifiers={[font({ weight: 'bold', size: 22 }), foregroundStyle(ink)]}>{time}</Text>
    ),
    expandedBottom: (
      <HStack>
        <Text modifiers={[font({ size: 14 }), foregroundStyle(muted)]}>{label}</Text>
        <Text modifiers={[font({ size: 14 }), foregroundStyle(muted)]}> · {props.paceLabel}</Text>
      </HStack>
    ),
  };
};

export const RunLiveActivity = createLiveActivity<RunActivityProps>('RoamRunActivity', RunActivity);
