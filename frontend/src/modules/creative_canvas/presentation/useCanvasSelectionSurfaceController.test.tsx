// Copyright (c) 2026 AI anime
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasMarqueeSelectionOptions } from "./useCanvasMarqueeSelection";
import type { CanvasSelectionCommandControllerOptions } from "./useCanvasSelectionCommandController";
import type { CanvasSelectionSyncOptions } from "./useCanvasSelectionSync";
import {
  useCanvasSelectionSurfaceController,
  type CanvasSelectionSurfaceControllerOptions,
  type CanvasSelectionSurfaceEdge,
  type CanvasSelectionSurfaceNode,
} from "./useCanvasSelectionSurfaceController";

interface TestNode extends CanvasSelectionSurfaceNode {
  hit?: boolean;
  upload?: boolean;
}

type TestEdge = CanvasSelectionSurfaceEdge;

const controllerMocks = vi.hoisted(() => {
  const marqueeController = { marqueeSelectionRect: null };
  const selectionResult = {
    selectedNodeIds: ["selected-node"],
    selectedUploadNodeId: "selected-node",
  };
  const commandController = {
    groupSelection: vi.fn(),
    deleteSelection: vi.fn(() => true),
  };
  return {
    marqueeController,
    selectionResult,
    commandController,
    useMarqueeSelection: vi.fn(
      (_options: CanvasMarqueeSelectionOptions<TestNode>) => marqueeController,
    ),
    useSelectionSync: vi.fn(
      (_options: CanvasSelectionSyncOptions<TestNode>) => selectionResult,
    ),
    useSelectionCommands: vi.fn(
      (_options: CanvasSelectionCommandControllerOptions<TestNode, TestEdge>) =>
        commandController,
    ),
  };
});

vi.mock("./useCanvasMarqueeSelection", () => ({
  useCanvasMarqueeSelection: controllerMocks.useMarqueeSelection,
}));
vi.mock("./useCanvasSelectionCommandController", () => ({
  useCanvasSelectionCommandController: controllerMocks.useSelectionCommands,
}));
vi.mock("./useCanvasSelectionSync", () => ({
  useCanvasSelectionSync: controllerMocks.useSelectionSync,
}));

function createOptions(): CanvasSelectionSurfaceControllerOptions<
  TestNode,
  TestEdge
> & {
  graph: { edges: TestEdge[] };
} {
  const graph = { edges: [] as TestEdge[] };
  return {
    wrapperRef: { current: null },
    disabled: false,
    nodes: [{ id: "selected-node", selected: true, hit: true, upload: true }],
    coordinatePort: {
      screenToFlowPosition: (position) => position,
    },
    nodeIntersectsSelectionRect: vi.fn((node) => node.hit === true),
    isImmersiveViewerActive: vi.fn(() => false),
    applyNodeSelectionChanges: vi.fn(),
    nativeSelectionStore: { setState: vi.fn() },
    selectedNodeId: "selected-node",
    setSelectedNodeId: vi.fn(),
    onMarqueeStart: vi.fn(),
    isUploadNode: vi.fn((node) => node.upload === true),
    getGraph: vi.fn(() => graph),
    isNodeDeletionLocked: vi.fn(() => false),
    isEdgeDeletionLocked: vi.fn(() => false),
    groupNodes: vi.fn(),
    deleteEdge: vi.fn(),
    deleteNode: vi.fn(),
    deleteNodes: vi.fn(),
    graph,
  };
}

describe("useCanvasSelectionSurfaceController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assembles marquee, projection and commands through explicit ports", () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasSelectionSurfaceController(options),
    );

    expect(controllerMocks.useMarqueeSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        wrapperRef: options.wrapperRef,
        disabled: false,
        nodes: options.nodes,
        coordinatePort: options.coordinatePort,
        collectCanvasNodeIdsInRect: expect.any(Function),
        isImmersiveViewerActive: options.isImmersiveViewerActive,
        applyNodeSelectionChanges: options.applyNodeSelectionChanges,
        setSelectedNodeId: options.setSelectedNodeId,
        onMarqueeStart: options.onMarqueeStart,
        setNativeSelectionActive: expect.any(Function),
      }),
    );
    expect(controllerMocks.useSelectionSync).toHaveBeenCalledWith({
      nodes: options.nodes,
      selectedNodeId: options.selectedNodeId,
      setSelectedNodeId: options.setSelectedNodeId,
      isUploadNode: options.isUploadNode,
    });
    expect(controllerMocks.useSelectionCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: options.nodes,
        selectedNodeIds: ["selected-node"],
        selectedNodeId: options.selectedNodeId,
        isNodeDeletionLocked: options.isNodeDeletionLocked,
        isEdgeDeletionLocked: options.isEdgeDeletionLocked,
        groupNodes: options.groupNodes,
        deleteEdge: options.deleteEdge,
        deleteNode: options.deleteNode,
        deleteNodes: options.deleteNodes,
      }),
    );
    expect(result.current).toEqual({
      ...controllerMocks.marqueeController,
      ...controllerMocks.selectionResult,
      ...controllerMocks.commandController,
    });
  });

  it("owns geometry, native-selection and latest-edge adapters", () => {
    const options = createOptions();
    renderHook(() => useCanvasSelectionSurfaceController(options));

    const marqueeOptions = controllerMocks.useMarqueeSelection.mock.calls[0][0];
    const selectionRect = { x: 0, y: 0, width: 100, height: 100 };
    expect(
      [...marqueeOptions.collectCanvasNodeIdsInRect(options.nodes, selectionRect)],
    ).toEqual(["selected-node"]);
    expect(options.nodeIntersectsSelectionRect).toHaveBeenCalledWith(
      options.nodes[0],
      selectionRect,
      expect.any(Map),
    );
    marqueeOptions.setNativeSelectionActive(true);
    expect(options.nativeSelectionStore.setState).toHaveBeenCalledWith({
      nodesSelectionActive: true,
    });

    const commandOptions = controllerMocks.useSelectionCommands.mock.calls[0][0];
    const currentEdge = { id: "edge-1" } as TestEdge;
    options.graph.edges.push(currentEdge);
    expect(commandOptions.getCurrentEdges()).toEqual([currentEdge]);
    expect(options.getGraph).toHaveBeenCalledOnce();
  });
});
