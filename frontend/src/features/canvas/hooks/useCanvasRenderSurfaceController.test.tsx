// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CanvasEdge,
  CanvasNode,
} from '../domain/canvasNodes';
import {
  useCanvasRenderSurfaceController,
  type CanvasRenderSurfaceControllerOptions,
} from './useCanvasRenderSurfaceController';

interface EdgeVisibilityState {
  hidden: boolean;
  toggle: () => void;
}

const controllerMocks = vi.hoisted(() => {
  const triggerPlacementConfirm = vi.fn();
  const placementConfirm = {
    placementConfirmNodeId: 'node-1' as string | null,
    triggerPlacementConfirm,
  };
  const edgeVisibility = {
    hidden: true,
    toggle: vi.fn(),
  };
  const renderedNodes = [{ id: 'rendered-node' }] as CanvasNode[];
  const renderedEdges = [{ id: 'rendered-edge' }] as CanvasEdge[];
  return {
    triggerPlacementConfirm,
    placementConfirm,
    edgeVisibility,
    renderedNodes,
    renderedEdges,
    usePlacementConfirm: vi.fn(() => placementConfirm),
    useEdgeVisibility: vi.fn(
      (selector: (state: EdgeVisibilityState) => unknown) =>
        selector(edgeVisibility),
    ),
    projectNodes: vi.fn(() => renderedNodes),
    projectEdges: vi.fn(() => renderedEdges),
  };
});

vi.mock('@/modules/creative_canvas/public', () => ({
  useCanvasNodePlacementConfirm: controllerMocks.usePlacementConfirm,
  useEdgeVisibilityStore: controllerMocks.useEdgeVisibility,
}));
vi.mock('../ui/canvasRenderProjection', () => ({
  projectCanvasNodesForRender: controllerMocks.projectNodes,
  projectCanvasEdgesForRender: controllerMocks.projectEdges,
}));

function createOptions(): CanvasRenderSurfaceControllerOptions {
  return {
    nodes: [{ id: 'node-1' }] as CanvasNode[],
    edges: [{ id: 'edge-1' }] as CanvasEdge[],
  };
}

describe('useCanvasRenderSurfaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    controllerMocks.placementConfirm.placementConfirmNodeId = 'node-1';
    controllerMocks.edgeVisibility.hidden = true;
  });

  it('projects nodes and edges from the transient render state', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasRenderSurfaceController(options),
    );

    expect(controllerMocks.projectNodes).toHaveBeenCalledWith(
      options.nodes,
      'node-1',
    );
    expect(controllerMocks.projectEdges).toHaveBeenCalledWith(
      options.edges,
      true,
    );
    expect(result.current).toEqual({
      renderedNodes: controllerMocks.renderedNodes,
      renderedEdges: controllerMocks.renderedEdges,
      triggerPlacementConfirm: controllerMocks.triggerPlacementConfirm,
    });
  });

  it('keeps projection-only state inside the render surface', () => {
    const options = createOptions();
    controllerMocks.placementConfirm.placementConfirmNodeId = null;
    controllerMocks.edgeVisibility.hidden = false;
    const { result } = renderHook(() =>
      useCanvasRenderSurfaceController(options),
    );

    expect(controllerMocks.projectNodes).toHaveBeenCalledWith(
      options.nodes,
      null,
    );
    expect(controllerMocks.projectEdges).toHaveBeenCalledWith(
      options.edges,
      false,
    );
    expect(result.current).not.toHaveProperty('placementConfirmNodeId');
    expect(result.current).not.toHaveProperty('edgesHidden');
  });
});
