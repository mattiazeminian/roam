import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useLocation } from "./location-context";
import { useSettings } from "./settings-context";
import {
  findRoutes,
  findRoutesBetween,
  routeThroughWaypoints,
  RoutingError,
  type Coordinate,
  type RouteCandidate,
  type RoutingErrorCode,
} from "./routing";

export type RouteSearchStatus = "idle" | "finding" | "ready" | "error";

/** Recalculation state for a manual route edit (#31). */
export type RouteEditStatus = "idle" | "recalculating" | "error";

export type RouteContextValue = {
  status: RouteSearchStatus;
  candidates: RouteCandidate[];
  selectedRoute: RouteCandidate | null;
  selectedIndex: number;
  targetKm: number | null;
  errorCode: RoutingErrorCode | null;
  errorMessage: string | null;
  /**
   * Run a search. Resolves true when at least one route was found. With a
   * `finish` it plans a one-way route there; without one, a loop (#17).
   */
  find: (origin: Coordinate, targetKm: number, finish?: Coordinate | null) => Promise<boolean>;
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

  /** Waypoints of the current manual edit; empty when the route is unedited. */
  editWaypoints: Coordinate[];
  /** Recalculation state for a manual edit (#31). */
  editStatus: RouteEditStatus;
  /** Whether there is an edit to undo. */
  canUndo: boolean;
  /** Drag an existing waypoint to a new position. */
  moveWaypoint: (index: number, coordinate: Coordinate) => void;
  /** Add a waypoint, rerouting the loop through it. */
  addWaypoint: (coordinate: Coordinate) => void;
  /** Remove the most recently added waypoint. */
  removeLastWaypoint: () => void;
  /** Step back to the previous edit state. */
  undoEdit: () => void;
  /** Discard the edit and return to the generated route. */
  resetEdit: () => void;
};

const RouteContext = createContext<RouteContextValue | null>(null);

/**
 * Holds the current route candidates and the selection.
 *
 * Route Selection and Active Run read the routes from here rather than
 * regenerating them. Regeneration only worked while routes came from a
 * deterministic mock; a real provider returns different geometry per call, so
 * the result of the one search the user actually ran has to be carried.
 *
 * Manual edits (#31) also live here, because an edit *is* a candidate: the
 * recalculated route replaces the selected one in place, keeping its id, so
 * the map's selection styling, the carousel and an active run all see the same
 * route without knowing an edit happened.
 */
export function RouteProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { origin } = useLocation();
  const [status, setStatus] = useState<RouteSearchStatus>("idle");
  const [candidates, setCandidates] = useState<RouteCandidate[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [targetKm, setTargetKm] = useState<number | null>(null);
  const [errorCode, setErrorCode] = useState<RoutingErrorCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [edited, setEdited] = useState<RouteCandidate | null>(null);
  const [editStatus, setEditStatus] = useState<RouteEditStatus>("idle");
  const [canUndo, setCanUndo] = useState(false);
  /** Prior edit states, newest last. `null` is "unedited". */
  const history = useRef<(RouteCandidate | null)[]>([]);
  /** Bumped to abandon a recalculation whose result is no longer wanted. */
  const editEpoch = useRef(0);

  const lastRequest = useRef<{
    origin: Coordinate;
    targetKm: number;
    finish: Coordinate | null;
  } | null>(null);
  // Guards against a second search starting before `status` commits.
  const inFlight = useRef(false);

  const clearEdit = useCallback(() => {
    editEpoch.current += 1;
    history.current = [];
    setEdited(null);
    setCanUndo(false);
    setEditStatus("idle");
    setErrorMessage(null);
  }, []);

  const find = useCallback(
    async (origin: Coordinate, requestedKm: number, finish: Coordinate | null = null) => {
      if (inFlight.current) {
        return false;
      }
      inFlight.current = true;
      lastRequest.current = { origin, targetKm: requestedKm, finish };

      setStatus("finding");
      setErrorCode(null);
      setErrorMessage(null);
      setTargetKm(requestedKm);

      try {
        const routes = finish
          ? await findRoutesBetween({
              origin,
              finish,
              targetKm: requestedKm,
              paceMinPerKm: settings.typicalPaceMinPerKm,
            })
          : await findRoutes({
              origin,
              targetKm: requestedKm,
              paceMinPerKm: settings.typicalPaceMinPerKm,
            });
        // New candidates invalidate any edit made to the previous ones.
        clearEdit();
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
    [clearEdit, settings.typicalPaceMinPerKm],
  );

  const retry = useCallback(async () => {
    const request = lastRequest.current;
    if (!request) {
      return false;
    }
    return find(request.origin, request.targetKm, request.finish);
  }, [find]);

  const select = useCallback(
    (index: number) => {
      // An edit belongs to the candidate it was made on.
      clearEdit();
      setSelectedIndex(index);
    },
    [clearEdit],
  );

  const loadSaved = useCallback(
    (route: RouteCandidate, savedTargetKm: number) => {
      lastRequest.current = null;
      clearEdit();
      setCandidates([route]);
      setSelectedIndex(0);
      setTargetKm(savedTargetKm);
      setErrorCode(null);
      setStatus("ready");
    },
    [clearEdit],
  );

  const clearError = useCallback(() => {
    setErrorCode(null);
    setErrorMessage(null);
    setStatus((current) => (current === "error" ? "idle" : current));
  }, []);

  const boundedIndex = Math.max(0, Math.min(selectedIndex, candidates.length - 1));
  const baseSelected = candidates[boundedIndex] ?? null;

  // The edit replaces the selected candidate, keeping its id. Rebuilt with a
  // new array rather than mutated so React sees the change.
  const displayCandidates = useMemo(() => {
    if (!edited || !baseSelected) {
      return candidates;
    }
    return candidates.map((candidate, index) =>
      index === boundedIndex ? edited : candidate,
    );
  }, [candidates, edited, baseSelected, boundedIndex]);

  const recalculate = useCallback(
    async (waypoints: Coordinate[]) => {
      if (!baseSelected) {
        return;
      }
      if (!origin) {
        setEditStatus("error");
        setErrorMessage("Your location is not available yet.");
        return;
      }

      const epoch = ++editEpoch.current;
      // Recorded before the request, so undo reflects what the runner saw.
      history.current.push(edited);
      setCanUndo(true);
      setEditStatus("recalculating");

      try {
        const next = await routeThroughWaypoints({
          origin,
          waypoints,
          paceMinPerKm: settings.typicalPaceMinPerKm,
        });
        if (epoch !== editEpoch.current) {
          return;
        }
        setEdited({ ...next, id: baseSelected.id });
        setEditStatus("idle");
        setErrorMessage(null);
      } catch (error) {
        if (epoch !== editEpoch.current) {
          return;
        }
        // The edit did not land, so it must not sit in the undo history.
        history.current.pop();
        setCanUndo(history.current.length > 0);
        setEditStatus("error");
        setErrorMessage(
          error instanceof RoutingError ? error.message : "Could not update the route.",
        );
      }
    },
    [baseSelected, edited, origin, settings.typicalPaceMinPerKm],
  );

  const moveWaypoint = useCallback(
    (index: number, coordinate: Coordinate) => {
      const current = edited?.waypoints ?? [];
      if (index < 0 || index >= current.length) {
        return;
      }
      void recalculate(current.map((point, i) => (i === index ? coordinate : point)));
    },
    [edited, recalculate],
  );

  const addWaypoint = useCallback(
    (coordinate: Coordinate) => {
      const current = edited?.waypoints ?? [];
      void recalculate([...current, coordinate]);
    },
    [edited, recalculate],
  );

  const removeLastWaypoint = useCallback(() => {
    const current = edited?.waypoints ?? [];
    if (current.length === 0) {
      return;
    }
    void recalculate(current.slice(0, -1));
  }, [edited, recalculate]);

  const undoEdit = useCallback(() => {
    // Abandon any in-flight recalculation: its result belongs to a state we
    // are leaving.
    editEpoch.current += 1;
    const previous = history.current.pop() ?? null;
    setEdited(previous);
    setCanUndo(history.current.length > 0);
    setEditStatus("idle");
    setErrorMessage(null);
  }, []);

  const resetEdit = useCallback(() => {
    clearEdit();
  }, [clearEdit]);

  const value = useMemo<RouteContextValue>(
    () => ({
      status,
      candidates: displayCandidates,
      selectedRoute: displayCandidates[boundedIndex] ?? null,
      selectedIndex: boundedIndex,
      targetKm,
      errorCode,
      errorMessage,
      find,
      retry,
      loadSaved,
      select,
      clearError,
      editWaypoints: edited?.waypoints ?? [],
      editStatus,
      canUndo,
      moveWaypoint,
      addWaypoint,
      removeLastWaypoint,
      undoEdit,
      resetEdit,
    }),
    [
      status,
      displayCandidates,
      boundedIndex,
      targetKm,
      errorCode,
      errorMessage,
      find,
      retry,
      loadSaved,
      select,
      clearError,
      edited,
      editStatus,
      canUndo,
      moveWaypoint,
      addWaypoint,
      removeLastWaypoint,
      undoEdit,
      resetEdit,
    ],
  );

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
