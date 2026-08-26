// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FreezoneCanvasPayload } from "../domain/canvasStorage";

import {
  createCanvasHydrateFlightCoordinator,
  FREEZONE_HYDRATE_RELEASE_GRACE_MS,
  FREEZONE_HYDRATE_SETTLED_REUSE_MS,
} from "./canvasHydrateFlights";

function payload(revision: number): FreezoneCanvasPayload {
  return { nodes: [], edges: [], revision };
}

function coordinator(
  loadCanvas: (
    project: string,
    canvasId: string,
    signal: AbortSignal,
  ) => Promise<FreezoneCanvasPayload>,
  hasLocalEdits: () => boolean = () => false,
) {
  return createCanvasHydrateFlightCoordinator({
    loadCanvas,
    hasLocalEdits,
    now: () => Date.now(),
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelScheduled: (handle) => window.clearTimeout(handle as number),
  });
}

describe("canvas hydrate flight coordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts an unconsumed in-flight request after the release grace", () => {
    const captured: { signal: AbortSignal | null } = { signal: null };
    const flights = coordinator((_project, _canvasId, nextSignal) => {
      captured.signal = nextSignal;
      return new Promise(() => undefined);
    });
    const lease = flights.acquire("project-a", "canvas-a", 0);

    lease.release();
    expect(captured.signal?.aborted).toBe(false);
    vi.advanceTimersByTime(FREEZONE_HYDRATE_RELEASE_GRACE_MS);
    expect(captured.signal?.aborted).toBe(true);
  });

  it("shares an in-flight request across a release and immediate reacquire", () => {
    const loadCanvas = vi.fn(
      () => new Promise<FreezoneCanvasPayload>(() => undefined),
    );
    const flights = coordinator(loadCanvas);
    const first = flights.acquire("project-a", "canvas-a", 0);

    first.release();
    const second = flights.acquire("project-a", "canvas-a", 0);
    vi.advanceTimersByTime(FREEZONE_HYDRATE_RELEASE_GRACE_MS);

    expect(loadCanvas).toHaveBeenCalledTimes(1);
    expect(second.promise).toBe(first.promise);
  });

  it("reuses a settled response only inside the settled reuse window", async () => {
    const loadCanvas = vi
      .fn<() => Promise<FreezoneCanvasPayload>>()
      .mockResolvedValueOnce(payload(1))
      .mockResolvedValueOnce(payload(2));
    const flights = coordinator(loadCanvas);
    const first = flights.acquire("project-a", "canvas-a", 0);
    await first.promise;
    first.release();

    const reused = flights.acquire("project-a", "canvas-a", 0);
    expect(await reused.promise).toEqual(payload(1));
    expect(loadCanvas).toHaveBeenCalledTimes(1);
    reused.release();

    vi.advanceTimersByTime(FREEZONE_HYDRATE_SETTLED_REUSE_MS + 1);
    const refreshed = flights.acquire("project-a", "canvas-a", 0);
    expect(await refreshed.promise).toEqual(payload(2));
    expect(loadCanvas).toHaveBeenCalledTimes(2);
  });

  it("invalidates a settled response when local edits exist", async () => {
    let edited = false;
    const loadCanvas = vi
      .fn<() => Promise<FreezoneCanvasPayload>>()
      .mockResolvedValueOnce(payload(1))
      .mockResolvedValueOnce(payload(2));
    const flights = coordinator(loadCanvas, () => edited);
    const first = flights.acquire("project-a", "canvas-a", 0);
    await first.promise;
    first.release();
    edited = true;

    const refreshed = flights.acquire("project-a", "canvas-a", 0);
    expect(await refreshed.promise).toEqual(payload(2));
    expect(loadCanvas).toHaveBeenCalledTimes(2);
  });
});
