// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { CANVAS_NODE_TYPES, type CanvasNode } from "@/features/canvas/domain/canvasNodes";

import { createStoredCanvasDraft } from "./canvasDraft";
import {
  canvasContentSignature,
  decideHydrateDraft,
} from "./canvasSyncHydration";

function node(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: "node-1",
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 10, y: 20 },
    data: { label: "draft" },
    ...overrides,
  } as CanvasNode;
}

function draft(overrides: { baseRevision?: number; nodes?: CanvasNode[] } = {}) {
  return createStoredCanvasDraft("project-a", "canvas-a", {
    baseRevision: overrides.baseRevision ?? 3,
    nodes: overrides.nodes ?? [node()],
    edges: [],
    viewport: null,
    metadata: { shotMetadata: { camera: "wide" } },
    history: { past: [], future: [] },
    mutation: {
      userEditsSinceHydrate: 0,
      lastMutationSource: null,
      pendingClearIntent: false,
    },
    updatedAt: 1,
  });
}

describe("canvas sync hydration decisions", () => {
  it("ignores React Flow transient fields in persisted content signatures", () => {
    const persisted = node();
    const transient = node({
      selected: true,
      dragging: true,
      measured: { width: 320, height: 180 },
    });

    expect(canvasContentSignature([transient], [])).toBe(
      canvasContentSignature([persisted], []),
    );
  });

  it("uses remote state when no draft exists", () => {
    expect(decideHydrateDraft(null, 3, "remote", [], [], null)).toEqual({
      kind: "remote",
    });
  });

  it("uses remote state when the draft content and metadata were already saved", () => {
    const localDraft = draft();
    expect(
      decideHydrateDraft(
        localDraft,
        4,
        "different-serialized-signature",
        localDraft.nodes,
        localDraft.edges,
        {
          shotMetadata: { camera: "wide", lens: "35mm" },
          serverOnly: true,
        },
      ),
    ).toEqual({ kind: "remote" });
  });

  it("restores a changed draft when its base revision still matches remote", () => {
    const localDraft = draft({ nodes: [node({ data: { label: "local" } })] });
    expect(
      decideHydrateDraft(localDraft, 3, "remote", [node()], [], null),
    ).toEqual({ kind: "draft", draft: localDraft });
  });

  it("reports a conflict when both the draft and remote revision changed", () => {
    const localDraft = draft({ baseRevision: 2 });
    const decision = decideHydrateDraft(
      localDraft,
      3,
      "remote",
      [node({ data: { label: "remote" } })],
      [],
      null,
    );

    expect(decision.kind).toBe("conflict");
    if (decision.kind === "conflict") {
      expect(decision.draft).toBe(localDraft);
      expect(decision.message).toContain("服务器版本已经变化");
    }
  });
});
