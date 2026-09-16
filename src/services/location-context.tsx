import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import * as location from './location';
import type { Coordinate } from './routing';

export type LocationStatus = 'requesting' | 'available' | 'denied' | 'unavailable';

/** A starting point the user picked instead of their own position. */
export type OriginOverride = {
  label: string;
  coordinate: Coordinate;
};

export type LocationContextValue = {
  status: LocationStatus;
  /** The device's own coordinate, or null when there is no usable location. */
  coordinate: Coordinate | null;
  /**
   * Where a run should start: the chosen place if there is one, otherwise the
   * device position. Screens should plan routes from this, not `coordinate`.
   */
  origin: Coordinate | null;
  /** Human-readable name for `origin`. */
  originLabel: string;
  /** True when the origin is a chosen place rather than the device position. */
  hasCustomOrigin: boolean;
  setOrigin: (override: OriginOverride) => void;
  resetOrigin: () => void;
  /**
   * Where a run ends, when the runner chose a finish. Null means a loop —
   * back to the start — which is the default (#17).
   */
  finish: OriginOverride | null;
  setFinish: (override: OriginOverride) => void;
  clearFinish: () => void;
  /** Re-check permission and restart tracking. */
  refresh: () => void;
};

const LocationContext = createContext<LocationContextValue | null>(null);

/**
 * Single source of the user's location for the app. Requests foreground
 * permission once (the system dialog only appears while undetermined), fetches
 * a first fix, then keeps it updated. Never falls back to a fake location.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LocationStatus>('requesting');
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [override, setOverride] = useState<OriginOverride | null>(null);
  const [finish, setFinish] = useState<OriginOverride | null>(null);
  const subscription = useRef<location.LocationSubscription | null>(null);

  const start = useCallback(async () => {
    setStatus('requesting');
    subscription.current?.remove();
    subscription.current = null;

    try {
      let permission = await location.getForegroundPermission();
      if (permission === 'undetermined') {
        permission = await location.requestForegroundPermission();
      }
      if (permission !== 'granted') {
        setCoordinate(null);
        setStatus('denied');
        return;
      }

      setCoordinate(await location.getCurrentCoordinate());
      setStatus('available');
      subscription.current = location.watchCoordinate((next) => setCoordinate(next));
    } catch {
      setCoordinate(null);
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    // Kicks off the permission check and first fix against the external
    // location API on mount — exactly the "subscribe to an external system"
    // case the rule describes as correct. The lint rule flags it because
    // `start`'s first statement (`setStatus('requesting')`) runs synchronously
    // before its first `await`; that call is redundant with the initial state
    // on mount and only does real work on a later `refresh()`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start();
    return () => {
      subscription.current?.remove();
      subscription.current = null;
    };
  }, [start]);

  const value = useMemo<LocationContextValue>(
    () => ({
      status,
      coordinate,
      origin: override?.coordinate ?? coordinate,
      originLabel: override?.label ?? 'Current location',
      hasCustomOrigin: override !== null,
      setOrigin: setOverride,
      resetOrigin: () => setOverride(null),
      finish,
      setFinish,
      clearFinish: () => setFinish(null),
      refresh: () => {
        void start();
      },
    }),
    [status, coordinate, override, finish, start],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const value = useContext(LocationContext);
  if (!value) {
    throw new Error('useLocation must be used inside <LocationProvider>');
  }
  return value;
}
