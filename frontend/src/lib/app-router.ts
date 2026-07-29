// Copyright (c) 2026 AI anime
import type { AnyRouter } from "@tanstack/react-router";

// The app's tanstack-router singleton. Registered once from app/bootstrap after the
// router is created, so plain (non-hook) modules — url-params and Freezone
// navigation composition —
// can route navigations THROUGH the router instead of mutating window.history
// directly.
//
// Why this matters: tanstack throttles its own navigations onto a microtask
// (@tanstack/history queueHistoryAction), so window.location lags a pending
// navigation, and a raw window.history write + synthetic popstate desyncs the
// rendered route from the URL (symptom: navigate to /ingest but still render the
// canvas). Going through router.navigate keeps everything on one consistent
// queue.
//
// Stays null under unit tests (no RouterProvider); callers fall back to the raw
// History API in that case.
let appRouter: AnyRouter | null = null;

export function setAppRouter(router: AnyRouter | null): void {
  appRouter = router;
}

export function getAppRouter(): AnyRouter | null {
  return appRouter;
}

/**
 * Current `?canvas` value, read from the router's location when available so it
 * reflects an in-flight (queued-but-not-yet-flushed) navigation. Falls back to
 * window.location for non-router contexts (unit tests, pre-mount).
 */
export function currentCanvasParam(): string | null {
  const router = appRouter;
  if (router) {
    const search = router.state.location.search as { canvas?: unknown };
    const canvas = search?.canvas;
    return typeof canvas === "string" && canvas.length > 0 ? canvas : null;
  }
  return new URLSearchParams(window.location.search).get("canvas");
}
