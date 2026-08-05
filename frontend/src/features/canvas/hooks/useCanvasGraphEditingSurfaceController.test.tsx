// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCanvasGraphEditingSurfaceController,
  type CanvasGraphEditingSurfaceControllerOptions,
} from './useCanvasGraphEditingSurfaceController';

const controllerMocks = vi.hoisted(() => {
  const clipboard = {
    duplicateNodes: vi.fn(),
    hasCopiedNodes: vi.fn(() => true),
    copySelection: vi.fn(),
    pasteSelection: vi.fn(),
    pasteAt: vi.fn(),
  };
  const graphInteraction = {
    handleNodesChange: vi.fn(),
    handleEdgesChange: vi.fn(),
    handleEdgeDoubleClick: vi.fn(),
    handleNodeDragStart: vi.fn(),
    handleNodeDrag: vi.fn(),
    handleNodeDragStop: vi.fn(),
    handleSelectionDragStart: vi.fn(),
    handleSelectionDragStop: vi.fn(),
  };
  const useClipboard = vi.fn(() => clipboard);
  return {
    clipboard,
    graphInteraction,
    useClipboard,
    createClipboardHook: vi.fn(() => useClipboard),
    useGraphInteraction: vi.fn(
      (_options: unknown) => graphInteraction,
    ),
  };
});

vi.mock('@/modules/creative_canvas/public', () => ({
  CANVAS_NODE_TYPES: { upload: 'uploadNode', imageEdit: 'imageNode', imageGen: 'imageGenNode', exportImage: 'exportImageNode', beatContext: 'beatContextNode', textAnnotation: 'textAnnotationNode', group: 'groupNode', storyboardSplit: 'storyboardNode', storyboardGen: 'storyboardGenNode', video: 'videoNode', audio: 'audioNode', videoStory: 'videoStoryNode', videoCompose: 'videoComposeNode', script: 'scriptNode', pano360Viewer: 'pano360ViewerNode', threeDWorld: 'threeDWorldNode', skill: 'skillNode' },
  cloneCanvasNodeData: (data: unknown) => data,
  createCanvasClipboardControllerHook: controllerMocks.createClipboardHook,
  getNodeSize: () => ({ width: 320, height: 200 }),
  hasRectCollision: () => false,
  useCanvasGraphInteractionController: controllerMocks.useGraphInteraction,
}));

function createOptions(): CanvasGraphEditingSurfaceControllerOptions {
  return {
    nodes: [],
    edges: [],
    selectedNodeIds: [],
    currentProject: 'project-1',
    getGraph: vi.fn(() => ({ nodes: [], edges: [] })),
    createNode: vi.fn(() => 'created-node'),
    applyNodeChanges: vi.fn(),
    connectNodes: vi.fn(),
    selectNode: vi.fn(),
    updateNodeData: vi.fn(),
    queueSnapshotPaste: vi.fn(),
    elevateNodes: vi.fn(),
    fitGroupToChildren: vi.fn(),
    alignNodeChanges: vi.fn(({ changes }) => changes),
    applyEdgeChanges: vi.fn(),
    deleteEdge: vi.fn(),
    clearSnapAlignment: vi.fn(),
  };
}

describe('useCanvasGraphEditingSurfaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles clipboard commands with the shared graph dependencies', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasGraphEditingSurfaceController(options),
    );

    expect(controllerMocks.useClipboard).toHaveBeenCalledWith({
      nodes: options.nodes,
      edges: options.edges,
      selectedNodeIds: options.selectedNodeIds,
      currentProject: options.currentProject,
      getGraph: options.getGraph,
      createNode: options.createNode,
      applyNodeChanges: options.applyNodeChanges,
      connectNodes: options.connectNodes,
      selectNode: options.selectNode,
      updateNodeData: options.updateNodeData,
      queueSnapshotPaste: options.queueSnapshotPaste,
    });
    expect(result.current).toEqual({
      hasCopiedNodes: controllerMocks.clipboard.hasCopiedNodes,
      copySelection: controllerMocks.clipboard.copySelection,
      pasteSelection: controllerMocks.clipboard.pasteSelection,
      pasteAt: controllerMocks.clipboard.pasteAt,
      ...controllerMocks.graphInteraction,
    });
  });

  it('keeps duplicateNodes internal to graph-interaction assembly', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasGraphEditingSurfaceController(options),
    );

    expect(controllerMocks.useGraphInteraction).toHaveBeenCalledWith({
      nodes: options.nodes,
      selectedNodeIds: options.selectedNodeIds,
      duplicateNodes: controllerMocks.clipboard.duplicateNodes,
      elevateNodes: options.elevateNodes,
      selectNode: options.selectNode,
      getGraph: options.getGraph,
      groupNodeType: 'groupNode',
      mapPositionCommit: expect.any(Function),
      fitGroupToChildren: options.fitGroupToChildren,
      alignNodeChanges: options.alignNodeChanges,
      applyNodeChanges: options.applyNodeChanges,
      applyEdgeChanges: options.applyEdgeChanges,
      deleteEdge: options.deleteEdge,
      clearSnapAlignment: options.clearSnapAlignment,
    });
    const graphOptions = controllerMocks.useGraphInteraction.mock.calls[0]?.[0] as {
      mapPositionCommit: (update: {
        nodeId: string;
        position: { x: number; y: number };
        dragging: boolean;
      }) => unknown;
    };
    expect(graphOptions.mapPositionCommit({
      nodeId: 'node-1',
      position: { x: 12, y: 34 },
      dragging: true,
    })).toEqual({
      id: 'node-1',
      type: 'position',
      position: { x: 12, y: 34 },
      dragging: true,
    });
    expect(result.current).not.toHaveProperty('duplicateNodes');
  });
});
