import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useSettings } from "./settings-context";
import {
  findRoutes,
  RoutingError,
  type Coordinate,
  type RouteCandidate,
  type RoutingErrorCode,
} from "./routing";

export type RouteSearchStatus = "idle" | "finding" | "ready" | "error";

export type RouteContextValue = {
  status: RouteSearchStatus;
  candidates: RouteCandidate[];
  selectedRoute: RouteCandidate | null;
  selectedIndex: number;
  targetKm: number | null;
  errorCode: RoutingErrorCode | null;
  errorMessage: string | null;
  /** Run a search. Resolves true when at least one route was found. */
  find: (origin: Coordinate, targetKm: number) => Promise<boolean>;
  /** Re-run the last search with the same origin and distance. */
  retry: () => Promise<boolean>;
  /**
   * Make a stored route the active candidate, so a saved loop can be started
   * without re-running a search. There is no origin to retry against, so this
   * clears any previous request.
   */
  loadSaved: (route: RouteCandidate, targetKm: number) => void;
  select: (index: number) => void;
  clearError: () => void;
};

const RouteContext = createContext<RouteContextValue | null>(null);

/**
 * Holds the current route candidates and the selection.
 *
 * Route Selection and Active Run read the routes from here rather than
 * regenerating them. Regeneration only worked while routes came from a
 * deterministic mock; a real provider returns different geometry per call, so
 * the result of the one search the user actually ran has to be carried.
 */
export function RouteProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [status, setStatus] = useState<RouteSearchStatus>("idle");
  const [candidates, setCandidates] = useState<RouteCandidate[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [targetKm, setTargetKm] = useState<number | null>(null);
  const [errorCode, setErrorCode] = useState<RoutingErrorCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lastRequest = useRef<{ origin: Coordinate; targetKm: number } | null>(
    null,
  );
  // Guards against a second search starting before `status` commits.
  const inFlight = useRef(false);

  const find = useCallback(
    async (origin: Coordinate, requestedKm: number) => {
      if (inFlight.current) {
        return false;
      }
      inFlight.current = true;
      lastRequest.current = { origin, targetKm: requestedKm };

      setStatus("finding");
      setErrorCode(null);
      setErrorMessage(null);
      setTargetKm(requestedKm);

      try {
        const routes = await findRoutes({
          origin,
          targetKm: requestedKm,
          paceMinPerKm: settings.typicalPaceMinPerKm,
        });
        setCandidates(routes);
        setSelectedIndex(0);
        setStatus("ready");
        return true;
      } catch (error) {
        setCandidates([]);
        setStatus("error");
        if (error instanceof RoutingError) {
          setErrorCode(error.code);
          setErrorMessage(error.message);
        } else {
          setErrorCode("network");
          setErrorMessage("Something went wrong while finding routes.");
        }
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [settings.typicalPaceMinPerKm],
  );

  const retry = useCallback(async () => {
    const request = lastRequest.current;
    if (!request) {
      return false;
    }
    return find(request.origin, request.targetKm);
  }, [find]);

  const select = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const loadSaved = useCallback((route: RouteCandidate, savedTargetKm: number) => {
    lastRequest.current = null;
    setCandidates([route]);
    setSelectedIndex(0);
    setTargetKm(savedTargetKm);
    setErrorCode(null);
    setErrorMessage(null);
    setStatus("ready");
  }, []);

  const clearError = useCallback(() => {
    setErrorCode(null);
    setErrorMessage(null);
    setStatus((current) => (current === "error" ? "idle" : current));
  }, []);

  const value = useMemo<RouteContextValue>(() => {
    const boundedIndex = Math.max(
      0,
      Math.min(selectedIndex, candidates.length - 1),
    );
    return {
      status,
      candidates,
      selectedRoute: candidates[boundedIndex] ?? null,
      selectedIndex: boundedIndex,
      targetKm,
      errorCode,
      errorMessage,
      find,
      retry,
      loadSaved,
      select,
      clearError,
    };
  }, [
    status,
    candidates,
    selectedIndex,
    targetKm,
    errorCode,
    errorMessage,
    find,
    retry,
    loadSaved,
    select,
    clearError,
  ]);

  return (
    <RouteContext.Provider value={value}>{children}</RouteContext.Provider>
  );
}

export function useRoutes(): RouteContextValue {
  const value = useContext(RouteContext);
  if (!value) {
    throw new Error("useRoutes must be used inside <RouteProvider>");
  }
  return value;
}
