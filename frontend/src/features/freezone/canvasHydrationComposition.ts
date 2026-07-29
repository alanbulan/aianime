// Copyright (c) 2026 AI anime
import { useCanvasStore } from "@/features/canvas/canvasStore";
import { getFreezoneCanvas } from "@/features/canvas/composition";

import { createCanvasHydrateFlightCoordinator } from "./application/canvasHydrateFlights";

export const canvasHydrateFlightCoordinator =
  createCanvasHydrateFlightCoordinator({
    loadCanvas: (project, canvasId, signal) =>
      getFreezoneCanvas(project, canvasId, { signal }),
    hasLocalEdits: () =>
      useCanvasStore.getState().userEditsSinceHydrate > 0,
    now: () => Date.now(),
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelScheduled: (handle) => window.clearTimeout(handle as number),
  });
