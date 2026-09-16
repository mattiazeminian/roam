import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  DEFAULT_SETTINGS,
  distanceUnitLabel,
  distanceUnitSpoken,
  loadSettings,
  metersToDisplay,
  paceToDisplay,
  saveSettings,
  type DistanceUnit,
  type Settings,
} from './settings';

export type Formatters = {
  unit: DistanceUnit;
  /** `km` / `mi`. */
  unitLabel: string;
  /** `kilometers` / `miles`, for VoiceOver. */
  unitSpoken: string;
  /** `5.24` in the chosen unit. */
  distance: (meters: number) => string;
  /** `6'03"` in the chosen unit, or `--'--"`. */
  pace: (minPerKm: number | null) => string;
  /** `6'03"/km`. */
  paceWithUnit: (minPerKm: number | null) => string;
  /** Spoken pace for VoiceOver. */
  paceSpoken: (minPerKm: number | null) => string;
};

export type SettingsContextValue = {
  settings: Settings;
  /** False until the stored settings have been read. */
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
  formatters: Formatters;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function formatPaceValue(minPerUnit: number | null): string {
  if (minPerUnit === null || !Number.isFinite(minPerUnit) || minPerUnit <= 0) {
    return `--'--"`;
  }
  const minutes = Math.floor(minPerUnit);
  const seconds = Math.round((minPerUnit - minutes) * 60);
  // Rounding 59.6s up must carry into the minutes rather than render 6'60".
  const carried = seconds === 60 ? { m: minutes + 1, s: 0 } : { m: minutes, s: seconds };
  return `${carried.m}'${carried.s.toString().padStart(2, '0')}"`;
}

/**
 * User preferences, and the formatters that depend on them.
 *
 * Distance and pace are computed in metric throughout the app; this is the only
 * place that turns them into what the user reads, so a unit change cannot leave
 * one screen disagreeing with another.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void loadSettings()
      .then((stored) => {
        if (active) {
          setSettings(stored);
          setLoaded(true);
        }
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      // Fire and forget: the in-memory value is the source of truth for this
      // session, and a failed write must not block the interaction.
      void saveSettings(next).catch(() => {});
      return next;
    });
  }, []);

  const formatters = useMemo<Formatters>(() => {
    const unit = settings.unit;
    const label = distanceUnitLabel(unit);
    return {
      unit,
      unitLabel: label,
      unitSpoken: distanceUnitSpoken(unit),
      distance: (meters: number) => metersToDisplay(meters, unit).toFixed(2),
      pace: (minPerKm: number | null) =>
        formatPaceValue(minPerKm === null ? null : paceToDisplay(minPerKm, unit)),
      paceWithUnit: (minPerKm: number | null) =>
        `${formatPaceValue(minPerKm === null ? null : paceToDisplay(minPerKm, unit))}/${label}`,
      paceSpoken: (minPerKm: number | null) => {
        if (minPerKm === null || !Number.isFinite(minPerKm) || minPerKm <= 0) {
          return 'Pace not available yet';
        }
        const value = paceToDisplay(minPerKm, unit);
        const minutes = Math.floor(value);
        const seconds = Math.round((value - minutes) * 60);
        const carried = seconds === 60 ? { m: minutes + 1, s: 0 } : { m: minutes, s: seconds };
        return `${carried.m} minutes ${carried.s} seconds per ${unit === 'mi' ? 'mile' : 'kilometer'}`;
      },
    };
  }, [settings.unit]);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, loaded, update, formatters }),
    [settings, loaded, update, formatters],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error('useSettings must be used inside <SettingsProvider>');
  }
  return value;
}

/** Shorthand for the common case of only needing the formatters. */
export function useFormatters(): Formatters {
  return useSettings().formatters;
}
