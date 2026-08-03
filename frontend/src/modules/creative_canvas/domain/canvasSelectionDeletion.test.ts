// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { resolveCanvasSelectionDeletion } from "./canvasSelectionDeletion";

interface SelectionNode {
  id: string;
  locked: boolean;
}

interface SelectionEdge {
  id: string;
  selected: boolean;
  locked: boolean;
}

function node(id: string, locked = false): SelectionNode {
  return { id, locked };
}

function edge(
  id: string,
  selected: boolean,
  locked = false,
): SelectionEdge {
  return { id, selected, locked };
}

function resolveSelection(params: {
  nodes: readonly SelectionNode[];
  edges: readonly SelectionEdge[];
  selectedNodeIds: readonly string[];
  selectedNodeId: string | null;
}) {
  return resolveCanvasSelectionDeletion({
    ...params,
    isNodeDeletionLocked: (candidate) => candidate.locked,
    isEdgeDeletionLocked: (candidate) => candidate.locked,
  });
}

describe("resolveCanvasSelectionDeletion", () => {
  it("filters locked nodes and edges from a mixed selection", () => {
    expect(resolveSelection({
      nodes: [node("node-open"), node("node-locked", true)],
      edges: [
        edge("edge-open", true),
        edge("edge-locked", true, true),
        edge("edge-unselected", false),
      ],
      selectedNodeIds: ["node-open", "node-locked"],
      selectedNodeId: null,
    })).toEqual({
      nodeIds: ["node-open"],
      edgeIds: ["edge-open"],
      hasSelectedTargets: true,
    });
  });

  it("falls back to the singular selected node id", () => {
    expect(resolveSelection({
      nodes: [node("node-1")],
      edges: [],
      selectedNodeIds: [],
      selectedNodeId: "node-1",
    })).toEqual({
      nodeIds: ["node-1"],
      edgeIds: [],
      hasSelectedTargets: true,
    });
  });

  it("reports locked selections so the keyboard handler can consume Backspace", () => {
    expect(resolveSelection({
      nodes: [node("node-locked", true)],
      edges: [edge("edge-locked", true, true)],
      selectedNodeIds: ["node-locked"],
      selectedNodeId: null,
    })).toEqual({
      nodeIds: [],
      edgeIds: [],
      hasSelectedTargets: true,
    });
  });

  it("reports an empty decision when nothing is selected", () => {
    expect(resolveSelection({
      nodes: [node("node-1")],
      edges: [edge("edge-1", false)],
      selectedNodeIds: [],
      selectedNodeId: null,
    })).toEqual({
      nodeIds: [],
      edgeIds: [],
      hasSelectedTargets: false,
    });
  });
});
