import type { WorkoutStep } from '@/services/training';
import type { DistanceUnit } from '@/services/settings';

type CueStep = Pick<WorkoutStep, 'label' | 'target' | 'repIndex' | 'repCount'>;

type SpeechModule = typeof import('expo-speech');
let speechModule: SpeechModule | null | undefined;

/**
 * Speech is an optional native capability. Keeping the lookup lazy means an
 * older installed development build can still run after the JS bundle has
 * been updated, until the native binary is rebuilt with expo-speech included.
 */
function getSpeech(): SpeechModule | null {
  if (speechModule !== undefined) {
    return speechModule;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    speechModule = require('expo-speech') as SpeechModule;
  } catch {
    speechModule = null;
  }
  return speechModule;
}

function unit(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function durationLabel(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  const parts: string[] = [];

  if (minutes > 0) {
    parts.push(unit(minutes, 'minute', 'minutes'));
  }
  if (remainder > 0 || parts.length === 0) {
    parts.push(unit(remainder, 'second', 'seconds'));
  }
  return parts.join(' ');
}

/**
 * The spoken/accessibility cue for a newly entered workout step.
 * Kept pure so copy changes are testable without rendering or device audio.
 */
export function workoutStepCue(step: CueStep): string {
  const repeat =
    step.repIndex && step.repCount ? ` Rep ${step.repIndex} of ${step.repCount}.` : '';
  const target =
    step.target.kind === 'duration'
      ? durationLabel(step.target.seconds)
      : unit(Math.round(step.target.meters), 'meter', 'meters');

  return `${step.label}.${repeat} ${target}.`;
}

/** A short time warning that does not compete with the current phase cue. */
export function workoutWarningCue(seconds: number): string {
  return `${durationLabel(seconds)} remaining.`;
}

/** The final structured-workout cue. Kept separate for future wearable output. */
export function workoutCompleteCue(): string {
  return 'Workout complete. Great work.';
}

/** A split cue reports only the completed distance: pace needs a stable sample. */
export function runSplitCue(split: number, unitName: DistanceUnit): string {
  const label = unitName === 'mi' ? (split === 1 ? 'mile' : 'miles') : (split === 1 ? 'kilometer' : 'kilometers');
  return `${split} ${label} complete.`;
}

/** Speak the latest cue without letting stale phase announcements queue up. */
function speakCue(cue: string): void {
  const speech = getSpeech();
  if (!speech) {
    return;
  }
  void speech.stop()
    .catch(() => undefined)
    .finally(() => {
      speech.speak(cue, {
        rate: 0.95,
        // Let iOS mix the cue with the run's other audio instead of replacing
        // the app's audio session.
        useApplicationAudioSession: false,
      });
      });
}

/** Speak a new structured-workout step when the runner has enabled guidance. */
export function speakWorkoutStep(step: CueStep, enabled: boolean): void {
  if (enabled) {
    speakCue(workoutStepCue(step));
  }
}

export function speakWorkoutWarning(seconds: number, enabled: boolean): void {
  if (enabled) {
    speakCue(workoutWarningCue(seconds));
  }
}

export function speakWorkoutComplete(enabled: boolean): void {
  if (enabled) {
    speakCue(workoutCompleteCue());
  }
}

export function speakRunSplit(split: number, unitName: DistanceUnit, enabled: boolean): void {
  if (enabled) {
    speakCue(runSplitCue(split, unitName));
  }
}

/** A short, recognizable cue used by the Settings test action. */
export function speakVoiceGuidanceTest(): void {
  speakCue('Voice guidance is on. Your next workout cue will sound like this.');
}
