// Copyright (c) 2026 AI anime
import { useEffect } from "react";

import { useCanvasStore } from "@/features/canvas/canvasStore";
import type { ViewportBookmark } from "@/features/canvas/domain/viewportBookmarks";

import { canvasContentSignature } from "../application/canvasSyncHydration";
import type { CanvasSyncStatus } from "../application/canvasSyncStorage";
import { canvasSyncStorageGateway } from "../canvasSyncComposition";

interface ValueRef<T> {
  current: T;
}

export interface CanvasHistoryPersistenceOptions {
  project: string;
  canvasId: string;
  hydratedRef: ValueRef<boolean>;
  switchingRef: ValueRef<boolean>;
}

export function useCanvasHistoryPersistence({
  project,
  canvasId,
  hydratedRef,
  switchingRef,
}: CanvasHistoryPersistenceOptions): void {
  useEffect(() => {
    let timer: number | null = null;
    const writeNow = () => {
      if (!hydratedRef.current || switchingRef.current) return;
      const state = useCanvasStore.getState();
      if (state.userEditsSinceHydrate <= 0) return;
      canvasSyncStorageGateway.writeHistory(
        project,
        canvasId,
        canvasContentSignature(state.nodes, state.edges),
        state.history,
      );
    };
    const unsubscribe = useCanvasStore.subscribe((state, previous) => {
      if (state.history === previous.history) return;
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(writeNow, 400);
    });
    const handleUnload = () => writeNow();
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", handleUnload);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [project, canvasId, hydratedRef, switchingRef]);
}

export interface CanvasViewportPersistenceOptions {
  project: string;
  canvasId: string;
  status: CanvasSyncStatus;
  lastSavedViewportRef: ValueRef<ViewportBookmark | null>;
}

function viewportsEqual(
  left: ViewportBookmark,
  right: ViewportBookmark,
): boolean {
  return (
    left.x === right.x && left.y === right.y && left.zoom === right.zoom
  );
}

export function useCanvasViewportPersistence({
  project,
  canvasId,
  status,
  lastSavedViewportRef,
}: CanvasViewportPersistenceOptions): void {
  useEffect(() => {
    if (status !== "ready") return;
    let timer: number | null = null;
    const unsubscribe = useCanvasStore.subscribe((state) => {
      const viewport = state.currentViewport;
      if (
        lastSavedViewportRef.current != null &&
        viewportsEqual(lastSavedViewportRef.current, viewport)
      ) {
        return;
      }
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        lastSavedViewportRef.current = viewport;
        canvasSyncStorageGateway.writeViewport(project, canvasId, viewport);
      }, 300);
    });
    return () => {
      unsubscribe();
      if (timer != null) window.clearTimeout(timer);
    };
  }, [project, canvasId, status, lastSavedViewportRef]);
}
