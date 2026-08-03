// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CanvasMarqueeSelectionOptions,
  CanvasSelectionCommandControllerOptions,
  CanvasSelectionSyncOptions,
} from '@/modules/creative_canvas/public';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';
import {
  useCanvasSelectionSurfaceController,
  type CanvasSelectionSurfaceControllerOptions,
} from './useCanvasSelectionSurfaceController';

const controllerMocks = vi.hoisted(() => {
  const marqueeController = { marqueeSelectionRect: null };
  const selectionResult = {
    selectedNodeIds: ['selected-node'],
    selectedUploadNodeId: 'selected-node',
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
      (_options: CanvasMarqueeSelectionOptions) => marqueeController,
    ),
    useSelectionSync: vi.fn(
      (_options: CanvasSelectionSyncOptions<CanvasNode>) => selectionResult,
    ),
    useSelectionCommands: vi.fn(
      (_options: CanvasSelectionCommandControllerOptions<CanvasNode, CanvasEdge>) =>
        commandController,
    ),
  };
});

vi.mock('@/modules/creative_canvas/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/creative_canvas/public')>()),
  useCanvasMarqueeSelection: controllerMocks.useMarqueeSelection,
  useCanvasSelectionCommandController: controllerMocks.useSelectionCommands,
  useCanvasSelectionSync: controllerMocks.useSelectionSync,
}));

function createOptions(): CanvasSelectionSurfaceControllerOptions & {
  graph: { edges: CanvasEdge[] };
} {
  const graph = { edges: [] as CanvasEdge[] };
  return {
    wrapperRef: { current: null },
    disabled: false,
    nodes: [],
    coordinatePort: {
      screenToFlowPosition: (position) => position,
    },
    applyNodeSelectionChanges: vi.fn(),
    nativeSelectionStore: { setState: vi.fn() },
    selectedNodeId: 'selected-node',
    setSelectedNodeId: vi.fn(),
    onMarqueeStart: vi.fn(),
    getGraph: vi.fn(() => graph),
    groupNodes: vi.fn(),
    deleteEdge: vi.fn(),
    deleteNode: vi.fn(),
    deleteNodes: vi.fn(),
    graph,
  };
}

describe('useCanvasSelectionSurfaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles marquee, projection and commands through one selection surface', () => {
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
        isImmersiveViewerActive: expect.any(Function),
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
      isUploadNode: expect.any(Function),
    });
    expect(controllerMocks.useSelectionCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: options.nodes,
        selectedNodeIds: ['selected-node'],
        selectedNodeId: options.selectedNodeId,
        isNodeDeletionLocked: expect.any(Function),
        isEdgeDeletionLocked: expect.any(Function),
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

  it('owns native selection state and latest-edge adapters', () => {
    const options = createOptions();
    renderHook(() => useCanvasSelectionSurfaceController(options));

    const marqueeOptions = controllerMocks.useMarqueeSelection.mock.calls[0][0];
    marqueeOptions.setNativeSelectionActive(true);
    expect(options.nativeSelectionStore.setState).toHaveBeenCalledWith({
      nodesSelectionActive: true,
    });

    const commandOptions = controllerMocks.useSelectionCommands.mock.calls[0][0];
    const currentEdge = { id: 'edge-1' } as CanvasEdge;
    options.graph.edges.push(currentEdge);
    expect(commandOptions.getCurrentEdges()).toEqual([currentEdge]);
    expect(options.getGraph).toHaveBeenCalledOnce();
  });
});
