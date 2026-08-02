// Copyright (c) 2026 AI anime
import type { FreezoneCanvasPayload } from "../domain/canvasStorage";

/** Let an immediate StrictMode remount attach before aborting the request. */
export const FREEZONE_HYDRATE_RELEASE_GRACE_MS = 50;
/** Reuse a settled payload only for quick remounts and only without local edits. */
export const FREEZONE_HYDRATE_SETTLED_REUSE_MS = 10_000;

export interface CanvasHydrateFlightLease {
  promise: Promise<FreezoneCanvasPayload>;
  release(): void;
}

export interface CanvasHydrateFlightCoordinator {
  acquire(
    project: string,
    canvasId: string,
    reloadKey: number,
  ): CanvasHydrateFlightLease;
}

export interface CanvasHydrateFlightDependencies {
  loadCanvas(
    project: string,
    canvasId: string,
    signal: AbortSignal,
  ): Promise<FreezoneCanvasPayload>;
  hasLocalEdits(): boolean;
  now(): number;
  schedule(callback: () => void, delayMs: number): unknown;
  cancelScheduled(handle: unknown): void;
}

interface HydrateFlight {
  controller: AbortController;
  promise: Promise<FreezoneCanvasPayload>;
  consumers: number;
  settled: boolean;
  settledAt: number | null;
  releaseTimer: unknown | null;
}

function hydrateFlightKey(
  project: string,
  canvasId: string,
  reloadKey: number,
): string {
  return `${project}\u0000${canvasId}\u0000${reloadKey}`;
}

export function createCanvasHydrateFlightCoordinator(
  dependencies: CanvasHydrateFlightDependencies,
): CanvasHydrateFlightCoordinator {
  const flights = new Map<string, HydrateFlight>();

  return {
    acquire(project, canvasId, reloadKey) {
      const key = hydrateFlightKey(project, canvasId, reloadKey);
      let flight = flights.get(key);
      if (flight?.settled) {
        const canReuseJustSettledFlight =
          flight.consumers === 0 &&
          flight.releaseTimer != null &&
          flight.settledAt != null &&
          dependencies.now() - flight.settledAt <=
            FREEZONE_HYDRATE_SETTLED_REUSE_MS &&
          !dependencies.hasLocalEdits();
        if (!canReuseJustSettledFlight) {
          if (flight.releaseTimer != null) {
            dependencies.cancelScheduled(flight.releaseTimer);
          }
          flights.delete(key);
          flight = undefined;
        }
      }
      if (!flight) {
        const controller = new AbortController();
        const createdFlight: HydrateFlight = {
          controller,
          promise: dependencies.loadCanvas(
            project,
            canvasId,
            controller.signal,
          ),
          consumers: 0,
          settled: false,
          settledAt: null,
          releaseTimer: null,
        };
        void createdFlight.promise.then(
          () => {
            createdFlight.settled = true;
            createdFlight.settledAt = dependencies.now();
          },
          () => {
            createdFlight.settled = true;
            createdFlight.settledAt = dependencies.now();
          },
        );
        flights.set(key, createdFlight);
        flight = createdFlight;
      }
      if (flight.releaseTimer != null) {
        dependencies.cancelScheduled(flight.releaseTimer);
        flight.releaseTimer = null;
      }
      flight.consumers += 1;
      const acquiredFlight = flight;
      let released = false;
      return {
        promise: acquiredFlight.promise,
        release: () => {
          if (released) return;
          released = true;
          acquiredFlight.consumers = Math.max(
            0,
            acquiredFlight.consumers - 1,
          );
          if (acquiredFlight.consumers > 0) return;
          acquiredFlight.releaseTimer = dependencies.schedule(() => {
            if (acquiredFlight.consumers > 0) return;
            if (flights.get(key) !== acquiredFlight) return;
            if (
              acquiredFlight.settled &&
              acquiredFlight.settledAt != null &&
              !dependencies.hasLocalEdits()
            ) {
              const remaining =
                FREEZONE_HYDRATE_SETTLED_REUSE_MS -
                (dependencies.now() - acquiredFlight.settledAt);
              if (remaining > 0) {
                acquiredFlight.releaseTimer = dependencies.schedule(() => {
                  if (
                    acquiredFlight.consumers === 0 &&
                    flights.get(key) === acquiredFlight
                  ) {
                    flights.delete(key);
                  }
                }, remaining);
                return;
              }
            }
            if (!acquiredFlight.settled) {
              acquiredFlight.controller.abort();
            }
            flights.delete(key);
          }, FREEZONE_HYDRATE_RELEASE_GRACE_MS);
        },
      };
    },
  };
}
