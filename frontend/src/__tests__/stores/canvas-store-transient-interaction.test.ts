// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

import { useCanvasStore } from "@/features/canvas/canvasStore";

describe("canvasStore transient interaction state", () => {
  beforeEach(() => {
    const state = useCanvasStore.getState();
    state.setActiveOverlayNodeId(null);
    state.setHoveredNodeId(null);
    state.clearPendingFocus();
  });

  it("publishes overlay and hover changes only when their target changes", () => {
    let notifications = 0;
    const unsubscribe = useCanvasStore.subscribe(() => {
      notifications += 1;
    });

    useCanvasStore.getState().setActiveOverlayNodeId("overlay-node");
    useCanvasStore.getState().setActiveOverlayNodeId("overlay-node");
    useCanvasStore.getState().setHoveredNodeId("hover-node");
    useCanvasStore.getState().setHoveredNodeId("hover-node");

    unsubscribe();
    expect(notifications).toBe(2);
    expect(useCanvasStore.getState()).toMatchObject({
      activeOverlayNodeId: "overlay-node",
      hoveredNodeId: "hover-node",
    });
  });

  it("re-publishes repeated focus requests and clears the one-shot state", () => {
    const publishedFocusIds: Array<string | null> = [];
    const unsubscribe = useCanvasStore.subscribe((state) => {
      publishedFocusIds.push(state.pendingFocusNodeId);
    });

    useCanvasStore.getState().requestFocusNode("focus-node");
    useCanvasStore.getState().requestFocusNode("focus-node");
    useCanvasStore.getState().clearPendingFocus();

    unsubscribe();
    expect(publishedFocusIds).toEqual(["focus-node", "focus-node", null]);
  });
});
