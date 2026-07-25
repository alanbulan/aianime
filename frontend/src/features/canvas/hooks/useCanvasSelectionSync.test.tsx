// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import { useCanvasSelectionSync } from './useCanvasSelectionSync';

function canvasNode(
  id: string,
  type: CanvasNode['type'],
  selected: boolean,
): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
    selected,
  } as CanvasNode;
}

describe('useCanvasSelectionSync', () => {
  it('projects one selected upload node and synchronizes its id', () => {
    const setSelectedNodeId = vi.fn();
    const nodes = [
      canvasNode('image-1', CANVAS_NODE_TYPES.imageEdit, false),
      canvasNode('upload-1', CANVAS_NODE_TYPES.upload, true),
    ];

    const { result } = renderHook(() =>
      useCanvasSelectionSync({
        nodes,
        selectedNodeId: null,
        setSelectedNodeId,
      }),
    );

    expect(result.current.selectedNodeIds).toEqual(['upload-1']);
    expect(result.current.selectedUploadNodeId).toBe('upload-1');
    expect(setSelectedNodeId).toHaveBeenCalledOnce();
    expect(setSelectedNodeId).toHaveBeenCalledWith('upload-1');
  });

  it('clears the single-node projection for a multi-selection', () => {
    const setSelectedNodeId = vi.fn();
    const nodes = [
      canvasNode('upload-1', CANVAS_NODE_TYPES.upload, true),
      canvasNode('image-1', CANVAS_NODE_TYPES.imageEdit, true),
    ];

    const { result } = renderHook(() =>
      useCanvasSelectionSync({
        nodes,
        selectedNodeId: 'upload-1',
        setSelectedNodeId,
      }),
    );

    expect(result.current.selectedNodeIds).toEqual(['upload-1', 'image-1']);
    expect(result.current.selectedUploadNodeId).toBeNull();
    expect(setSelectedNodeId).toHaveBeenCalledWith(null);
  });

  it('does not write when the single-node projection is already aligned', () => {
    const setSelectedNodeId = vi.fn();
    const nodes = [canvasNode('image-1', CANVAS_NODE_TYPES.imageEdit, true)];

    const { result } = renderHook(() =>
      useCanvasSelectionSync({
        nodes,
        selectedNodeId: 'image-1',
        setSelectedNodeId,
      }),
    );

    expect(result.current.selectedNodeIds).toEqual(['image-1']);
    expect(result.current.selectedUploadNodeId).toBeNull();
    expect(setSelectedNodeId).not.toHaveBeenCalled();
  });
});
