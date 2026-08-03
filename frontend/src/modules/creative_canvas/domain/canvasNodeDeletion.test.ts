// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  collectBatchDeletableIds,
  collectNodeIdsWithDescendants,
  deleteCanvasNodes,
} from "./canvasNodeDeletion";

interface TestNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentId?: string;
  extent?: string;
}

interface TestEdge {
  id: string;
  source: string;
  target: string;
}

function node(
  id: string,
  type: string,
  extra: Partial<TestNode> = {},
): TestNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
    ...extra,
  };
}

function collectBatch(
  nodes: readonly TestNode[],
  selectedIds: Iterable<string>,
): string[] {
  return collectBatchDeletableIds(
    nodes,
    selectedIds,
    (candidate) => candidate.type === "group",
  );
}

describe("collectBatchDeletableIds", () => {
  it("re-includes a group when every child is selected", () => {
    const nodes = [
      node("g1", "group"),
      node("a", "audio", { parentId: "g1" }),
      node("b", "text", { parentId: "g1" }),
    ];

    expect(new Set(collectBatch(nodes, ["a", "b"]))).toEqual(
      new Set(["g1", "a", "b"]),
    );
  });

  it("re-includes every fully selected group", () => {
    const nodes = [
      node("g1", "group"),
      node("a", "audio", { parentId: "g1" }),
      node("g2", "group"),
      node("c", "audio", { parentId: "g2" }),
      node("d", "text", { parentId: "g2" }),
    ];

    expect(new Set(collectBatch(nodes, ["a", "c", "d"]))).toEqual(
      new Set(["g1", "g2", "a", "c", "d"]),
    );
  });

  it("keeps a group when only some children are selected", () => {
    const nodes = [
      node("g1", "group"),
      node("a", "audio", { parentId: "g1" }),
      node("b", "text", { parentId: "g1" }),
    ];

    expect(new Set(collectBatch(nodes, ["a"]))).toEqual(new Set(["a"]));
  });

  it("keeps a group containing a preset-managed child", () => {
    const nodes = [
      node("g1", "group"),
      node("a", "audio", { parentId: "g1" }),
      node("locked", "image", {
        parentId: "g1",
        data: { preset_managed: true },
      }),
    ];

    expect(new Set(collectBatch(nodes, ["a", "locked"]))).toEqual(
      new Set(["a"]),
    );
  });

  it("excludes a preset-managed group", () => {
    const nodes = [
      node("g1", "group", { data: { preset_managed: true } }),
      node("a", "audio", { parentId: "g1" }),
    ];

    expect(new Set(collectBatch(nodes, ["g1", "a"]))).toEqual(
      new Set(["a"]),
    );
  });

  it("passes an ordinary multi-selection through", () => {
    const nodes = [node("a", "audio"), node("b", "image")];

    expect(new Set(collectBatch(nodes, ["a", "b"]))).toEqual(
      new Set(["a", "b"]),
    );
  });
});

describe("collectNodeIdsWithDescendants", () => {
  it("collects every nested descendant", () => {
    const nodes = [
      node("group", "group"),
      node("child", "group", { parentId: "group" }),
      node("grandchild", "upload", { parentId: "child" }),
      node("other", "upload"),
    ];

    expect(collectNodeIdsWithDescendants(nodes, ["group"])).toEqual(
      new Set(["group", "child", "grandchild"]),
    );
  });
});

describe("deleteCanvasNodes", () => {
  it("returns null when no requested node is deletable", () => {
    const locked = node("locked", "image", {
      data: { preset_managed: true },
    });

    expect(
      deleteCanvasNodes([locked], [], ["", "missing", locked.id], () => ({
        x: 0,
        y: 0,
      })),
    ).toBeNull();
  });

  it("cascades descendants, promotes locked nodes, and removes incident edges", () => {
    const group = node("group", "group", {
      position: { x: 10, y: 20 },
    });
    const child = node("child", "group", {
      parentId: group.id,
      position: { x: 30, y: 40 },
    });
    const locked = node("locked", "upload", {
      parentId: child.id,
      extent: "parent",
      position: { x: 5, y: 6 },
      data: { preset_managed: true },
    });
    const outside = node("outside", "text", {
      position: { x: 200, y: 100 },
    });
    const edges: TestEdge[] = [
      { id: "to-group", source: outside.id, target: group.id },
      { id: "to-locked", source: outside.id, target: locked.id },
      { id: "from-locked", source: locked.id, target: outside.id },
    ];

    const result = deleteCanvasNodes(
      [group, child, locked, outside],
      edges,
      [group.id, group.id],
      (candidate) =>
        candidate.id === locked.id
          ? { x: 45, y: 66 }
          : candidate.position,
    );

    expect(result).not.toBeNull();
    expect(result?.deletedNodeIds).toEqual(new Set([group.id, child.id]));
    expect(result?.nodes).toEqual([
      expect.objectContaining({
        id: locked.id,
        parentId: undefined,
        extent: undefined,
        position: { x: 45, y: 66 },
      }),
      outside,
    ]);
    expect(result?.edges).toEqual([edges[1], edges[2]]);
  });
});
