/**
 * Tests for manual route editing (#31).
 *
 * The gesture layer on the map cannot be exercised without a device, but the
 * editing *logic* — recalculation, undo, reset, and the guarantee that an edit
 * replaces the selected candidate in place — is all in `RouteProvider` and is
 * covered here with the routing service mocked.
 */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { RouteProvider, useRoutes, type RouteContextValue } from '../route-context';
import { findRoutes, routeThroughWaypoints, RoutingError, type RouteCandidate } from '../routing';

jest.mock('../location-context', () => ({
  useLocation: () => ({ origin: { latitude: 40.7484, longitude: -73.9857 } }),
}));

jest.mock('../settings-context', () => ({
  useSettings: () => ({ settings: { typicalPaceMinPerKm: 6 } }),
}));

jest.mock('../routing', () => {
  const actual = jest.requireActual('../routing') as typeof import('../routing');
  return {
    ...actual,
    findRoutes: jest.fn(),
    findRoutesBetween: jest.fn(),
    routeThroughWaypoints: jest.fn(),
  };
});

const findRoutesMock = findRoutes as unknown as jest.Mock<typeof findRoutes>;
const recalculateMock = routeThroughWaypoints as unknown as jest.Mock<
  typeof routeThroughWaypoints
>;

const ORIGIN = { latitude: 40.7484, longitude: -73.9857 };
const WP1 = { latitude: 40.752, longitude: -73.981 };
const WP2 = { latitude: 40.745, longitude: -73.979 };
const MOVED = { latitude: 40.753, longitude: -73.982 };

function route(id: string, distanceKm: number): RouteCandidate {
  return {
    id,
    distanceKm,
    estimatedMinutes: distanceKm * 6,
    geometry: [
      { latitude: 40.748, longitude: -73.986 },
      { latitude: 40.752, longitude: -73.981 },
      { latitude: 40.745, longitude: -73.979 },
      { latitude: 40.748, longitude: -73.986 },
    ],
    characteristics: ['Loop'],
  };
}

function Harness({ onValue }: { onValue: (value: RouteContextValue) => void }) {
  onValue(useRoutes());
  return null;
}

function renderRoutes() {
  let latest!: RouteContextValue;
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <RouteProvider>
        <Harness
          onValue={(value) => {
            latest = value;
          }}
        />
      </RouteProvider>,
    );
  });
  return {
    get value() {
      return latest;
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

async function flush() {
  // A macrotask, not a microtask: the provider's async work chains several
  // awaits, and React only commits the resulting state inside `act`.
  await new Promise((resolve) => setTimeout(resolve, 0));
  act(() => {});
}

/** Populates the provider with the two mocked candidates. */
async function withFoundRoutes() {
  const harness = renderRoutes();
  act(() => {
    void harness.value.find(ORIGIN, 5, null);
  });
  await flush();
  return harness;
}

beforeEach(() => {
  findRoutesMock.mockReset();
  recalculateMock.mockReset();
  findRoutesMock.mockResolvedValue([route('route-1', 5), route('route-2', 6)]);
});

describe('manual route editing (#31)', () => {
  test('adding a waypoint recalculates and replaces the selected candidate in place', async () => {
    const harness = await withFoundRoutes();
    expect(harness.value.candidates).toHaveLength(2);

    recalculateMock.mockResolvedValue({ ...route('route-edited', 4.2), waypoints: [WP1] });
    act(() => harness.value.addWaypoint(WP1));
    await flush();

    expect(recalculateMock).toHaveBeenCalledTimes(1);
    expect(recalculateMock.mock.calls[0][0]).toMatchObject({
      origin: ORIGIN,
      waypoints: [WP1],
    });
    // Same slot, same id — so the map's selection styling and the carousel
    // still point at "the selected route".
    expect(harness.value.candidates).toHaveLength(2);
    expect(harness.value.candidates[0].id).toBe('route-1');
    expect(harness.value.candidates[0].distanceKm).toBeCloseTo(4.2);
    expect(harness.value.selectedRoute?.waypoints).toEqual([WP1]);
    // The other candidate is untouched.
    expect(harness.value.candidates[1].id).toBe('route-2');
    harness.unmount();
  });

  test('moving a waypoint reroutes through the new position', async () => {
    const harness = await withFoundRoutes();
    recalculateMock.mockResolvedValue({ ...route('route-edited', 4.2), waypoints: [WP1] });
    act(() => harness.value.addWaypoint(WP1));
    await flush();

    act(() => harness.value.moveWaypoint(0, MOVED));
    await flush();

    expect(recalculateMock.mock.calls.at(-1)?.[0].waypoints).toEqual([MOVED]);
    harness.unmount();
  });

  test('removing the last waypoint reroutes without it', async () => {
    const harness = await withFoundRoutes();
    recalculateMock.mockResolvedValue({ ...route('route-edited', 4.2), waypoints: [WP1] });
    act(() => harness.value.addWaypoint(WP1));
    await flush();
    recalculateMock.mockResolvedValue({ ...route('route-edited', 4.4), waypoints: [WP1, WP2] });
    act(() => harness.value.addWaypoint(WP2));
    await flush();

    recalculateMock.mockClear();
    act(() => harness.value.removeLastWaypoint());
    await flush();

    expect(recalculateMock.mock.calls[0][0].waypoints).toEqual([WP1]);
    harness.unmount();
  });

  test('undo steps back to the unedited route', async () => {
    const harness = await withFoundRoutes();
    recalculateMock.mockResolvedValue({ ...route('route-edited', 4.2), waypoints: [WP1] });
    act(() => harness.value.addWaypoint(WP1));
    await flush();
    expect(harness.value.canUndo).toBe(true);

    act(() => harness.value.undoEdit());

    expect(harness.value.selectedRoute?.waypoints).toBeUndefined();
    expect(harness.value.selectedRoute?.distanceKm).toBe(5);
    expect(harness.value.canUndo).toBe(false);
    expect(harness.value.editWaypoints).toEqual([]);
    harness.unmount();
  });

  test('reset discards the edit and its history', async () => {
    const harness = await withFoundRoutes();
    recalculateMock.mockResolvedValue({ ...route('route-edited', 4.2), waypoints: [WP1] });
    act(() => harness.value.addWaypoint(WP1));
    await flush();

    act(() => harness.value.resetEdit());

    expect(harness.value.selectedRoute?.distanceKm).toBe(5);
    expect(harness.value.canUndo).toBe(false);
    harness.unmount();
  });

  test('a failed recalculation surfaces an error without changing the route', async () => {
    const harness = await withFoundRoutes();
    recalculateMock.mockRejectedValue(new RoutingError('network', 'Could not reach the routing service.'));

    act(() => harness.value.addWaypoint(WP1));
    await flush();

    expect(harness.value.editStatus).toBe('error');
    expect(harness.value.errorMessage).toBe('Could not reach the routing service.');
    // The failed edit must not leave a phantom entry in the undo history.
    expect(harness.value.canUndo).toBe(false);
    expect(harness.value.selectedRoute?.distanceKm).toBe(5);
    expect(harness.value.editWaypoints).toEqual([]);
    harness.unmount();
  });

  test('selecting another candidate discards the edit', async () => {
    const harness = await withFoundRoutes();
    recalculateMock.mockResolvedValue({ ...route('route-edited', 4.2), waypoints: [WP1] });
    act(() => harness.value.addWaypoint(WP1));
    await flush();

    act(() => harness.value.select(1));

    expect(harness.value.selectedRoute?.id).toBe('route-2');
    expect(harness.value.editWaypoints).toEqual([]);
    expect(harness.value.canUndo).toBe(false);
    harness.unmount();
  });
});
