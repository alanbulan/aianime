// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useCanvasSelectionCommandController,
  type CanvasSelectionCommandControllerOptions,
} from "./useCanvasSelectionCommandController";

interface SelectionNode {
  id: string;
  locked: boolean;
}

interface SelectionEdge {
  id: string;
  selected: boolean;
  locked: boolean;
}

function node(id: string): SelectionNode {
  return { id, locked: false };
}

function selectedEdge(id: string): SelectionEdge {
  return { id, selected: true, locked: false };
}

function createOptions(
  overrides: Partial<
    CanvasSelectionCommandControllerOptions<SelectionNode, SelectionEdge>
  > = {},
): CanvasSelectionCommandControllerOptions<SelectionNode, SelectionEdge> {
  return {
    nodes: [node("node-a"), node("node-b")],
    selectedNodeIds: ["node-a", "node-b"],
    selectedNodeId: null,
    getCurrentEdges: vi.fn(() => [selectedEdge("edge-1")]),
    isNodeDeletionLocked: (candidate) => candidate.locked,
    isEdgeDeletionLocked: (candidate) => candidate.locked,
    groupNodes: vi.fn(),
    deleteEdge: vi.fn(),
    deleteNode: vi.fn(),
    deleteNodes: vi.fn(),
    ...overrides,
  };
}

describe("useCanvasSelectionCommandController", () => {
  it("groups the current box selection through the injected command", () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasSelectionCommandController(options),
    );

    act(() => result.current.groupSelection());

    expect(options.groupNodes).toHaveBeenCalledWith(["node-a", "node-b"]);
  });

  it("deletes selected edges before dispatching the matching node command", () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasSelectionCommandController(options),
    );

    let handled = false;
    act(() => {
      handled = result.current.deleteSelection();
    });

    expect(handled).toBe(true);
    expect(options.getCurrentEdges).toHaveBeenCalledOnce();
    expect(options.deleteEdge).toHaveBeenCalledWith("edge-1");
    expect(options.deleteNodes).toHaveBeenCalledWith(["node-a", "node-b"]);
    expect(options.deleteNode).not.toHaveBeenCalled();
  });

  it("uses the single-node command for the focused-node fallback", () => {
    const options = createOptions({
      selectedNodeIds: [],
      selectedNodeId: "node-a",
      getCurrentEdges: vi.fn(() => []),
    });
    const { result } = renderHook(() =>
      useCanvasSelectionCommandController(options),
    );

    act(() => {
      result.current.deleteSelection();
    });

    expect(options.deleteNode).toHaveBeenCalledWith("node-a");
    expect(options.deleteNodes).not.toHaveBeenCalled();
  });
});
