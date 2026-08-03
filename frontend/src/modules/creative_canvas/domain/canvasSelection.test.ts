// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  collectCanvasNodeIdsInRect,
  resolveActiveToolDialog,
  resolveSelectedNodeId,
  type CanvasSelectionNode,
  type CanvasSelectionRect,
} from "./canvasSelection";

interface TestSelectionNode extends CanvasSelectionNode {
  hit: boolean;
}

const selectionRect: CanvasSelectionRect = {
  x: 90,
  y: 90,
  width: 120,
  height: 100,
};

describe("Canvas selection", () => {
  it("collects nodes accepted by the injected geometry rule", () => {
    const nodes: TestSelectionNode[] = [
      { id: "inside", hit: true },
      { id: "outside", hit: false },
    ];
    const intersects = vi.fn((node: TestSelectionNode) => node.hit);

    expect(
      [...collectCanvasNodeIdsInRect(nodes, selectionRect, intersects)],
    ).toEqual(["inside"]);
    expect(intersects).toHaveBeenCalledWith(
      nodes[0],
      selectionRect,
      expect.any(Map),
    );
  });

  it("drops a hit ancestor when one of its descendants is also hit", () => {
    const nodes: TestSelectionNode[] = [
      { id: "group", hit: true },
      { id: "child", parentId: "group", hit: true },
    ];

    expect(
      [
        ...collectCanvasNodeIdsInRect(
          nodes,
          selectionRect,
          (node) => node.hit,
        ),
      ],
    ).toEqual(["child"]);
  });

  it("keeps a hit container when none of its descendants are hit", () => {
    const nodes: TestSelectionNode[] = [
      { id: "group", hit: true },
      { id: "child", parentId: "group", hit: false },
    ];

    expect(
      [
        ...collectCanvasNodeIdsInRect(
          nodes,
          selectionRect,
          (node) => node.hit,
        ),
      ],
    ).toEqual(["group"]);
  });

  it("keeps only a selected node that still exists", () => {
    const nodes: CanvasSelectionNode[] = [{ id: "existing" }];

    expect(resolveSelectedNodeId("existing", nodes)).toBe("existing");
    expect(resolveSelectedNodeId("missing", nodes)).toBeNull();
    expect(resolveSelectedNodeId(null, nodes)).toBeNull();
  });

  it("keeps only a tool dialog whose target still exists", () => {
    const nodes: CanvasSelectionNode[] = [{ id: "existing" }];
    const dialog = { nodeId: "existing", toolType: "crop" };

    expect(resolveActiveToolDialog(dialog, nodes)).toBe(dialog);
    expect(
      resolveActiveToolDialog({ ...dialog, nodeId: "missing" }, nodes),
    ).toBeNull();
    expect(resolveActiveToolDialog(null, nodes)).toBeNull();
  });
});
