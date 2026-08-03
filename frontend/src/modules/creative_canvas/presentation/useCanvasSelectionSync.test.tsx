// Copyright (c) 2026 AI anime
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCanvasSelectionSync } from "./useCanvasSelectionSync";

interface SelectionNode {
  id: string;
  kind: "image" | "upload";
  selected: boolean;
}

function canvasNode(
  id: string,
  kind: SelectionNode["kind"],
  selected: boolean,
): SelectionNode {
  return { id, kind, selected };
}

function isUploadNode(node: SelectionNode): boolean {
  return node.kind === "upload";
}

describe("useCanvasSelectionSync", () => {
  it("projects one selected upload node and synchronizes its id", () => {
    const setSelectedNodeId = vi.fn();
    const nodes = [
      canvasNode("image-1", "image", false),
      canvasNode("upload-1", "upload", true),
    ];

    const { result } = renderHook(() =>
      useCanvasSelectionSync({
        nodes,
        selectedNodeId: null,
        setSelectedNodeId,
        isUploadNode,
      }),
    );

    expect(result.current.selectedNodeIds).toEqual(["upload-1"]);
    expect(result.current.selectedUploadNodeId).toBe("upload-1");
    expect(setSelectedNodeId).toHaveBeenCalledOnce();
    expect(setSelectedNodeId).toHaveBeenCalledWith("upload-1");
  });

  it("clears the single-node projection for a multi-selection", () => {
    const setSelectedNodeId = vi.fn();
    const nodes = [
      canvasNode("upload-1", "upload", true),
      canvasNode("image-1", "image", true),
    ];

    const { result } = renderHook(() =>
      useCanvasSelectionSync({
        nodes,
        selectedNodeId: "upload-1",
        setSelectedNodeId,
        isUploadNode,
      }),
    );

    expect(result.current.selectedNodeIds).toEqual(["upload-1", "image-1"]);
    expect(result.current.selectedUploadNodeId).toBeNull();
    expect(setSelectedNodeId).toHaveBeenCalledWith(null);
  });

  it("does not write when the single-node projection is already aligned", () => {
    const setSelectedNodeId = vi.fn();
    const nodes = [canvasNode("image-1", "image", true)];

    const { result } = renderHook(() =>
      useCanvasSelectionSync({
        nodes,
        selectedNodeId: "image-1",
        setSelectedNodeId,
        isUploadNode,
      }),
    );

    expect(result.current.selectedNodeIds).toEqual(["image-1"]);
    expect(result.current.selectedUploadNodeId).toBeNull();
    expect(setSelectedNodeId).not.toHaveBeenCalled();
  });
});
