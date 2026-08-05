// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type CanvasNode, type StoryboardSplitNodeData } from '@/features/canvas/domain/canvasNodes';
import type { StoryboardFrameItem } from '@/modules/creative_canvas/public';

import { useStoryboardNodeController } from './useStoryboardNodeController';

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
const mocks = vi.hoisted(() => ({
  upstreamNodes: [] as CanvasNode[],
  zoom: 1,
  setSelectedNode: vi.fn(),
  reorderStoryboardFrame: vi.fn(),
  addDerivedExportNode: vi.fn(),
  addEdge: vi.fn(),
  updateStoryboardFrame: vi.fn(),
  updateNodeData: vi.fn(),
  updateNodeInternals: vi.fn(),
  prepareNodeImage: vi.fn(),
  uploadLocalImageToBackend: vi.fn(),
  exportStoryboardGrid: vi.fn(),
  packStoryboardFrames: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  useStore: (
    selector: (state: { transform: [number, number, number] }) => unknown,
  ) => selector({ transform: [0, 0, mocks.zoom] }),
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
  NodeToolbar: () => null,
}));

vi.mock('@/features/canvas/canvasStore', () => {
  const state = () => ({
    setSelectedNode: mocks.setSelectedNode,
    reorderStoryboardFrame: mocks.reorderStoryboardFrame,
    addDerivedExportNode: mocks.addDerivedExportNode,
    addEdge: mocks.addEdge,
    updateStoryboardFrame: mocks.updateStoryboardFrame,
    updateNodeData: mocks.updateNodeData,
  });
  return {
    useCanvasStore: (selector: (value: ReturnType<typeof state>) => unknown) =>
      selector(state()),
  };
});

vi.mock('@/features/canvas/composition', () => ({
  prepareNodeImage: (...args: unknown[]) => mocks.prepareNodeImage(...args),
  uploadLocalImageToBackend: (...args: unknown[]) =>
    mocks.uploadLocalImageToBackend(...args),
  exportStoryboardGrid: (...args: unknown[]) =>
    mocks.exportStoryboardGrid(...args),
  packStoryboardFrames: (...args: unknown[]) =>
    mocks.packStoryboardFrames(...args),
  useUpstreamNodes: () => mocks.upstreamNodes,
}));

function frame(
  id: string,
  order: number,
  patch: Partial<StoryboardFrameItem> = {},
): StoryboardFrameItem {
  return {
    id,
    imageUrl: `/${id}.png`,
    previewImageUrl: `/${id}-preview.png`,
    aspectRatio: '16:9',
    note: '',
    order,
    ...patch,
  };
}

function data(
  patch: Partial<StoryboardSplitNodeData> = {},
): StoryboardSplitNodeData {
  return {
    displayName: '分镜拆分结果',
    aspectRatio: '16:9',
    frameAspectRatio: '16:9',
    gridRows: 1,
    gridCols: 2,
    frames: [frame('late', 1), frame('first', 0)],
    ...patch,
  };
}

function upstreamNode(
  id: string,
  type: CanvasNode['type'],
  imageUrl: string,
  previewImageUrl?: string,
): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { imageUrl, previewImageUrl },
  } as CanvasNode;
}

describe('useStoryboardNodeController', () => {
  beforeEach(() => {
    mocks.upstreamNodes.splice(0);
    mocks.zoom = 1;
    mocks.setSelectedNode.mockReset();
    mocks.reorderStoryboardFrame.mockReset();
    mocks.addDerivedExportNode.mockReset().mockReturnValue('derived-a');
    mocks.addEdge.mockReset();
    mocks.updateStoryboardFrame.mockReset();
    mocks.updateNodeData.mockReset();
    mocks.updateNodeInternals.mockReset();
    mocks.prepareNodeImage.mockReset().mockResolvedValue({
      imageUrl: 'data:image/png;base64,prepared',
      aspectRatio: '16:9',
    });
    mocks.uploadLocalImageToBackend
      .mockReset()
      .mockResolvedValue('/uploaded.png');
    mocks.exportStoryboardGrid.mockReset().mockResolvedValue({
      imageUrl: '/grid.png',
      aspectRatio: '16:9',
    });
    mocks.packStoryboardFrames.mockReset().mockResolvedValue(undefined);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });

  it('projects ordered frames and owns node and export-option writes', () => {
    const { result } = renderHook(() =>
      useStoryboardNodeController({
        projectId: 'project-a',
        id: 'storyboard-a',
        data: data(),
        selected: true,
        width: 500.4,
        height: 400.4,
      }),
    );

    expect(result.current).toMatchObject({
      id: 'storyboard-a',
      selected: true,
      title: '分镜拆分结果',
    });
    expect(result.current.projection.orderedFrames.map((item) => item.id)).toEqual([
      'first',
      'late',
    ]);
    expect(result.current.projection.size).toEqual({ width: 500, height: 400 });
    expect(mocks.updateNodeInternals).toHaveBeenCalledWith('storyboard-a');

    act(() => result.current.select());
    act(() => result.current.rename('新标题'));
    act(() => result.current.updateFrameNote('first', '新描述'));
    act(() => result.current.patchExportOptions({ showFrameIndex: true }));

    expect(mocks.setSelectedNode).toHaveBeenCalledWith('storyboard-a');
    expect(mocks.updateNodeData).toHaveBeenNthCalledWith(1, 'storyboard-a', {
      displayName: '新标题',
    });
    expect(mocks.updateStoryboardFrame).toHaveBeenCalledWith(
      'storyboard-a',
      'first',
      { note: '新描述' },
    );
    expect(mocks.updateNodeData).toHaveBeenNthCalledWith(
      2,
      'storyboard-a',
      {
        exportOptions: expect.objectContaining({ showFrameIndex: true }),
      },
    );
  });

  it('deduplicates supported upstream images and replaces both image fields', () => {
    mocks.upstreamNodes.push(
      upstreamNode(
        'upload',
        CANVAS_NODE_TYPES.upload,
        '/same.png',
        '/same-preview.png',
      ),
      upstreamNode('duplicate', CANVAS_NODE_TYPES.exportImage, '/same.png'),
      upstreamNode('edit', CANVAS_NODE_TYPES.imageEdit, '/edit.png'),
      upstreamNode('ignored', CANVAS_NODE_TYPES.script, '/ignored.png'),
    );
    const { result } = renderHook(() =>
      useStoryboardNodeController({
        projectId: 'project-a',
        id: 'storyboard-a',
        data: data(),
      }),
    );

    expect(result.current.incomingImageItems.map((item) => item.label)).toEqual([
      '图1',
      '图2',
    ]);
    act(() => result.current.togglePicker('first', 120, 240));
    expect(result.current.pickerState).toEqual({
      frameId: 'first',
      x: 120,
      y: 240,
    });
    act(() => result.current.replaceFromInput('first', '/same.png'));
    expect(mocks.updateStoryboardFrame).toHaveBeenCalledWith(
      'storyboard-a',
      'first',
      {
        imageUrl: '/same.png',
        previewImageUrl: '/same-preview.png',
      },
    );
    expect(result.current.pickerState).toBeNull();
  });

  it('owns pointer drag lifecycle and commits only a changed order', () => {
    const { result } = renderHook(() =>
      useStoryboardNodeController({
        projectId: 'project-a',
        id: 'storyboard-a',
        data: data(),
      }),
    );

    act(() => result.current.startSort('first'));
    expect(document.body.style.userSelect).toBe('none');
    expect(document.body.style.cursor).toBe('grabbing');
    act(() => result.current.hoverSortTarget('late'));
    act(() => window.dispatchEvent(new Event('pointerup')));

    expect(mocks.reorderStoryboardFrame).toHaveBeenCalledWith(
      'storyboard-a',
      'first',
      'late',
    );
    expect(result.current.draggedFrameId).toBeNull();
    expect(document.body.style.userSelect).toBe('');
    expect(document.body.style.cursor).toBe('');
  });

  it('prepares and uploads one frame before creating its edit node', async () => {
    const target = frame('first', 0);
    const { result } = renderHook(() =>
      useStoryboardNodeController({
        projectId: 'project-a',
        id: 'storyboard-a',
        data: data({ frames: [target] }),
      }),
    );

    await act(async () => result.current.editFrame(target));
    expect(mocks.prepareNodeImage).toHaveBeenCalledWith('/first.png');
    expect(mocks.uploadLocalImageToBackend).toHaveBeenCalledWith(
      'project-a',
      'data:image/png;base64,prepared',
      expect.stringMatching(/^storyboard-frame-storyboard-a-/),
    );
    expect(mocks.addDerivedExportNode).toHaveBeenCalledWith(
      'storyboard-a',
      '/uploaded.png',
      '16:9',
      '/uploaded.png',
      {
        defaultTitle: '格 1',
        resultKind: 'storyboardFrameEdit',
      },
    );
    expect(mocks.addEdge).toHaveBeenCalledWith('storyboard-a', 'derived-a');

    await act(async () =>
      result.current.editFrame(
        frame('empty', 1, { imageUrl: null, previewImageUrl: null }),
      ),
    );
    expect(result.current.exportError).toBe('该格没有可编辑图片');
  });

  it('coordinates grid export and single-image packing without duplicate work', async () => {
    const { result } = renderHook(() =>
      useStoryboardNodeController({
        projectId: 'project-a',
        id: 'storyboard-a',
        data: data(),
      }),
    );

    await act(async () => result.current.exportGrid());
    expect(mocks.exportStoryboardGrid).toHaveBeenCalledWith(
      'project-a',
      expect.objectContaining({
        nodeId: 'storyboard-a',
        rows: 1,
        cols: 2,
        frames: expect.arrayContaining([
          expect.objectContaining({ id: 'first' }),
          expect.objectContaining({ id: 'late' }),
        ]),
      }),
    );
    expect(mocks.addDerivedExportNode).toHaveBeenCalledWith(
      'storyboard-a',
      '/grid.png',
      '16:9',
      '/grid.png',
      expect.objectContaining({ resultKind: 'storyboardSplitExport' }),
    );
    expect(mocks.addEdge).toHaveBeenCalledWith('storyboard-a', 'derived-a');

    await act(async () => result.current.packSingleImages());
    expect(mocks.packStoryboardFrames).toHaveBeenCalledWith(
      'project-a',
      result.current.projection.orderedFrames,
    );
    expect(result.current.isAnyExporting).toBe(false);
  });
});
