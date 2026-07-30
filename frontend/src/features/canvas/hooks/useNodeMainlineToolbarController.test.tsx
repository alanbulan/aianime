// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeType,
} from "@/features/canvas/domain/canvasNodes";

import { useNodeMainlineToolbarController } from "./useNodeMainlineToolbarController";

const mocks = vi.hoisted(() => ({
  addNode: vi.fn(() => "context-new"),
  nodes: [] as CanvasNode[],
  openWorkbench: vi.fn(),
  readUrl: vi.fn(() => ({ project: "project-a" })),
  requestFocusNode: vi.fn(),
  setSelectedNode: vi.fn(),
}));

vi.mock("@/lib/url-params", () => ({
  readUrl: () => mocks.readUrl(),
}));

vi.mock("@/features/freezone/public", () => ({
  extractMainlineContextsFromNode: (candidate: CanvasNode) => {
    const contexts = (candidate.data as { mainline_context?: unknown })
      .mainline_context;
    return Array.isArray(contexts) ? contexts : [];
  },
  openPresetProjectionInMyCanvas: (
    projectId: string,
    input: {
      scope: "beat";
      episode: number;
      beat: number;
      primary_slot: string;
    },
  ) => mocks.openWorkbench(projectId, input),
}));

vi.mock("@/features/canvas/canvasStore", () => {
  const state = {
    addNode: mocks.addNode,
    requestFocusNode: mocks.requestFocusNode,
    setSelectedNode: mocks.setSelectedNode,
  };
  const useCanvasStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => ({ nodes: mocks.nodes }) },
  );
  return { useCanvasStore };
});

function node(
  type: CanvasNodeType,
  data: Record<string, unknown>,
  patch: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id: "node-a",
    type,
    position: { x: 10, y: 20 },
    data,
    ...patch,
  } as CanvasNode;
}

const beatContext = {
  kind: "beat" as const,
  projectId: "project-a",
  episode: 2,
  beat: 3,
  label: "EP2 / Beat 3",
};

describe("useNodeMainlineToolbarController", () => {
  beforeEach(() => {
    mocks.addNode.mockReset().mockReturnValue("context-new");
    mocks.nodes = [];
    mocks.openWorkbench.mockReset();
    mocks.readUrl.mockReset().mockReturnValue({ project: "project-a" });
    mocks.requestFocusNode.mockReset();
    mocks.setSelectedNode.mockReset();
  });

  it("opens a locked preset workbench once and clears pending state", async () => {
    let resolveOpen!: () => void;
    mocks.openWorkbench.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveOpen = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useNodeMainlineToolbarController({
        node: node(CANVAS_NODE_TYPES.upload, {
          workbench_target: { scope: "beat", episode: 2, beat: 3 },
        }),
        isPresetLocked: true,
      }),
    );

    expect(result.current.canOpenWorkbench).toBe(true);
    act(() => result.current.openWorkbench());
    expect(result.current.openingWorkbench).toBe(true);
    act(() => result.current.openWorkbench());
    expect(mocks.openWorkbench).toHaveBeenCalledTimes(1);
    expect(mocks.openWorkbench).toHaveBeenCalledWith("project-a", {
      scope: "beat",
      episode: 2,
      beat: 3,
      primary_slot: "render",
    });

    await act(async () => resolveOpen());
    expect(result.current.openingWorkbench).toBe(false);
  });

  it("focuses an existing node with the same Beat identity", () => {
    mocks.nodes = [
      node(
        CANVAS_NODE_TYPES.beatContext,
        { mainline_context: [beatContext] },
        { id: "context-existing" },
      ),
    ];
    const { result } = renderHook(() =>
      useNodeMainlineToolbarController({
        node: node(CANVAS_NODE_TYPES.upload, {
          mainline_context: [beatContext],
        }),
        isPresetLocked: false,
      }),
    );

    expect(result.current.canEnsureBeatContext).toBe(true);
    act(() => result.current.ensureBeatContextNode());

    expect(mocks.setSelectedNode).toHaveBeenCalledWith("context-existing");
    expect(mocks.requestFocusNode).toHaveBeenCalledWith("context-existing");
    expect(mocks.addNode).not.toHaveBeenCalled();
  });

  it("creates and focuses a missing Beat context to the right", () => {
    const { result } = renderHook(() =>
      useNodeMainlineToolbarController({
        node: node(
          CANVAS_NODE_TYPES.upload,
          { mainline_context: [beatContext] },
          { measured: { width: 500, height: 300 } },
        ),
        isPresetLocked: false,
      }),
    );

    act(() => result.current.ensureBeatContextNode());

    expect(mocks.addNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.beatContext,
      { x: 590, y: 20 },
      expect.objectContaining({
        displayName: "镜头上下文 · EP2/B3",
        projectId: "project-a",
        episode: 2,
        beat: 3,
        mainline_context: [beatContext],
      }),
    );
    expect(mocks.setSelectedNode).toHaveBeenCalledWith("context-new");
    expect(mocks.requestFocusNode).toHaveBeenCalledWith("context-new");
  });

  it("does not expose recursive or context-free creation", () => {
    const beatNode = renderHook(() =>
      useNodeMainlineToolbarController({
        node: node(CANVAS_NODE_TYPES.beatContext, {
          mainline_context: [beatContext],
        }),
        isPresetLocked: false,
      }),
    );
    const plainNode = renderHook(() =>
      useNodeMainlineToolbarController({
        node: node(CANVAS_NODE_TYPES.upload, {}),
        isPresetLocked: false,
      }),
    );

    expect(beatNode.result.current.canEnsureBeatContext).toBe(false);
    expect(plainNode.result.current.canEnsureBeatContext).toBe(false);
  });
});
