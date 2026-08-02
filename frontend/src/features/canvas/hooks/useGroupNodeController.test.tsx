// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasAsset } from '@/features/canvas/domain/canvasAssets';
import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type GroupNodeData,
} from '@/features/canvas/domain/canvasNodes';

import { useGroupNodeController } from './useGroupNodeController';

const mocks = vi.hoisted(() => ({
  nodes: [] as CanvasNode[],
  dragHistorySnapshot: null as object | null,
  updateNodeData: vi.fn(),
  fitGroupToChildren: vi.fn(),
  reorderStoryboardMember: vi.fn(),
  addStoryboardMembers: vi.fn(),
  deleteNode: vi.fn(),
  snapEnabled: true,
  setSnapGuides: vi.fn(),
  clearSnapGuides: vi.fn(),
  zoom: 2,
  uploadCanvasAsset: vi.fn(
    async (_project: string, file: File, _displayName: string) => ({
      url: `/uploaded/${file.name}`,
    }),
  ),
  projectionStatus: null as { stale: boolean } | null,
  useCanvasProjectionStatus: vi.fn(),
  toast: vi.fn(),
  translate: vi.fn(
    (key: string, values?: { count?: number }) =>
      values?.count == null ? key : `${key}:${values.count}`,
  ),
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    getViewport: () => ({ zoom: mocks.zoom }),
  }),
}));

vi.mock('zustand/react/shallow', () => ({
  useShallow: <T,>(selector: T) => selector,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.translate }),
}));

vi.mock('sonner', () => ({
  toast: (message: string) => mocks.toast(message),
}));

vi.mock('@/features/canvas/composition', () => ({
  uploadCanvasAsset: (project: string, file: File, displayName: string) =>
    mocks.uploadCanvasAsset(project, file, displayName),
}));

vi.mock('@/modules/creative_canvas/public', () => ({
  useCanvasProjectionStatus: (projectionKey: string | null) => {
    mocks.useCanvasProjectionStatus(projectionKey);
    return mocks.projectionStatus;
  },
}));

vi.mock('@/features/canvas/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: Record<string, unknown>) => unknown,
  ) =>
    selector({
      nodes: mocks.nodes,
      dragHistorySnapshot: mocks.dragHistorySnapshot,
      updateNodeData: mocks.updateNodeData,
      fitGroupToChildren: mocks.fitGroupToChildren,
      reorderStoryboardMember: mocks.reorderStoryboardMember,
      addStoryboardMembers: mocks.addStoryboardMembers,
      deleteNode: mocks.deleteNode,
    }),
}));

vi.mock('@/features/canvas/snap-align/snapAlignStore', () => ({
  useSnapAlignStore: (
    selector: (state: Record<string, unknown>) => unknown,
  ) =>
    selector({
      enabled: mocks.snapEnabled,
      setGuides: mocks.setSnapGuides,
      clearGuides: mocks.clearSnapGuides,
    }),
}));

function data(patch: Partial<GroupNodeData> = {}): GroupNodeData {
  return {
    label: '组',
    displayName: '组',
    ...patch,
  };
}

function node({
  id,
  parentId,
  x = 0,
  y = 0,
  type = CANVAS_NODE_TYPES.upload,
  nodeData = {},
}: {
  id: string;
  parentId?: string;
  x?: number;
  y?: number;
  type?: CanvasNode['type'];
  nodeData?: Record<string, unknown>;
}): CanvasNode {
  return {
    id,
    parentId,
    type,
    position: { x, y },
    data: nodeData,
  } as CanvasNode;
}

describe('useGroupNodeController', () => {
  beforeEach(() => {
    mocks.nodes.splice(0);
    mocks.dragHistorySnapshot = null;
    mocks.updateNodeData.mockReset();
    mocks.fitGroupToChildren.mockReset();
    mocks.reorderStoryboardMember.mockReset();
    mocks.addStoryboardMembers.mockReset();
    mocks.deleteNode.mockReset();
    mocks.snapEnabled = true;
    mocks.setSnapGuides.mockReset();
    mocks.clearSnapGuides.mockReset();
    mocks.zoom = 2;
    mocks.uploadCanvasAsset.mockReset().mockImplementation(
      async (_project: string, file: File, _displayName: string) => ({
        url: `/uploaded/${file.name}`,
      }),
    );
    mocks.projectionStatus = null;
    mocks.useCanvasProjectionStatus.mockReset();
    mocks.toast.mockReset();
    mocks.translate.mockClear();
  });

  it('projects storyboard members in reading order and owns node commands', () => {
    mocks.nodes.push(
      node({ id: 'group-a', x: 100, y: 200, type: CANVAS_NODE_TYPES.group }),
      node({
        id: 'image-c',
        parentId: 'group-a',
        x: 100,
        y: 20,
        nodeData: { imageUrl: '/c.png' },
      }),
      node({
        id: 'video-b',
        parentId: 'group-a',
        x: 10,
        y: 20,
        type: CANVAS_NODE_TYPES.video,
        nodeData: { previewImageUrl: '/b.jpg' },
      }),
      node({
        id: 'image-a',
        parentId: 'group-a',
        x: 80,
        y: 10,
        nodeData: { imageUrl: '/a.png' },
      }),
    );
    mocks.projectionStatus = { stale: true };
    const { result } = renderHook(() =>
      useGroupNodeController({
        id: 'group-a',
        data: data({
          storyboardGroup: true,
          storyboardCols: 2,
          storyboardShowIndex: true,
          projection_key: ' projection-a ',
        }),
        projectId: 'project-a',
        selected: true,
      }),
    );

    expect(result.current).toMatchObject({
      id: 'group-a',
      selected: true,
      isStoryboard: true,
      showIndex: true,
      headerTitle: 'canvas.storyboardGroup.headerCount:3',
      projectionIsStale: true,
      isDragging: false,
    });
    expect(
      result.current.storyboardCells.map((cell) => cell.preview.nodeId),
    ).toEqual(['image-a', 'video-b', 'image-c']);
    expect(result.current.emptyCells).toHaveLength(1);
    expect(mocks.useCanvasProjectionStatus).toHaveBeenCalledWith(
      'projection-a',
    );
    expect(mocks.fitGroupToChildren).not.toHaveBeenCalled();

    act(() => result.current.rename('新分镜组'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('group-a', {
      displayName: '新分镜组',
      label: '新分镜组',
    });
  });

  it('auto-fits only plain groups outside an active drag interaction', () => {
    mocks.nodes.push(
      node({ id: 'group-a', type: CANVAS_NODE_TYPES.group }),
      node({ id: 'child-a', parentId: 'group-a', x: 20, y: 30 }),
    );
    const plain = renderHook(() =>
      useGroupNodeController({
        id: 'group-a',
        data: data({ user_spawned: true, projection_key: 'ignored' }),
        projectId: 'project-a',
      }),
    );

    expect(plain.result.current).toMatchObject({
      isStoryboard: false,
      showIndex: false,
      headerTitle: '组',
    });
    expect(plain.result.current.storyboardCells).toEqual([]);
    expect(mocks.fitGroupToChildren).toHaveBeenCalledWith('group-a');
    expect(mocks.useCanvasProjectionStatus).toHaveBeenCalledWith(null);
    plain.unmount();

    mocks.fitGroupToChildren.mockReset();
    mocks.dragHistorySnapshot = {};
    const interacting = renderHook(() =>
      useGroupNodeController({
        id: 'group-a',
        data: data(),
        projectId: 'project-a',
      }),
    );
    expect(mocks.fitGroupToChildren).not.toHaveBeenCalled();
    interacting.unmount();
  });

  it('uploads image files and projects selected history assets into members', async () => {
    mocks.nodes.push(
      node({ id: 'group-a', type: CANVAS_NODE_TYPES.group }),
    );
    const { result } = renderHook(() =>
      useGroupNodeController({
        id: 'group-a',
        data: data({ storyboardGroup: true }),
        projectId: 'project-a',
      }),
    );
    const image = new File(['image'], 'frame.png', { type: 'image/png' });
    const text = new File(['text'], 'notes.txt', { type: 'text/plain' });

    await act(async () => {
      await result.current.uploadLocalFiles(
        [image, text] as unknown as FileList,
      );
    });
    expect(mocks.uploadCanvasAsset).toHaveBeenCalledOnce();
    expect(mocks.uploadCanvasAsset).toHaveBeenCalledWith(
      'project-a',
      image,
      'frame.png',
    );
    expect(mocks.addStoryboardMembers).toHaveBeenCalledWith('group-a', [
      {
        imageUrl: '/uploaded/frame.png',
        previewImageUrl: '/uploaded/frame.png',
        displayName: 'frame.png',
      },
    ]);
    expect(result.current.uploading).toBe(false);

    await act(async () => {
      await result.current.uploadLocalFiles([text] as unknown as FileList);
    });
    expect(mocks.toast).toHaveBeenCalledWith(
      'canvas.storyboardGroup.imageOnlyHint',
    );

    const asset: CanvasAsset = {
      id: 'asset-a',
      kind: 'image',
      url: '/history/full.png',
      previewUrl: '/history/preview.webp',
      nodeId: 'image-history',
      label: '历史画面',
      timestamp: null,
    };
    act(() => result.current.pickHistoryAsset(asset));
    expect(mocks.addStoryboardMembers).toHaveBeenLastCalledWith('group-a', [
      {
        imageUrl: '/history/full.png',
        previewImageUrl: '/history/preview.webp',
        displayName: '历史画面',
      },
    ]);
  });

  it('converts screen drag distance by zoom and commits only changed slots', () => {
    mocks.nodes.push(
      node({ id: 'group-a', x: 100, y: 200, type: CANVAS_NODE_TYPES.group }),
      node({
        id: 'image-a',
        parentId: 'group-a',
        x: 0,
        y: 0,
        nodeData: { imageUrl: '/a.png' },
      }),
      node({
        id: 'image-b',
        parentId: 'group-a',
        x: 10,
        y: 0,
        nodeData: { imageUrl: '/b.png' },
      }),
    );
    const { result } = renderHook(() =>
      useGroupNodeController({
        id: 'group-a',
        data: data({ storyboardGroup: true, storyboardCols: 2 }),
        projectId: 'project-a',
      }),
    );

    act(() => {
      result.current.startStoryboardDrag(0, { x: 0, y: 0 });
    });
    expect(result.current.isDragging).toBe(true);
    expect(result.current.storyboardCells).toHaveLength(1);
    expect(result.current.floating?.preview.nodeId).toBe('image-a');

    act(() => {
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 1200, clientY: 0 }),
      );
    });
    expect(mocks.setSnapGuides).toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    expect(mocks.reorderStoryboardMember).toHaveBeenCalledWith(
      'group-a',
      0,
      1,
    );
    expect(mocks.clearSnapGuides).toHaveBeenCalledOnce();
    expect(result.current.isDragging).toBe(false);

    mocks.reorderStoryboardMember.mockReset();
    act(() => {
      result.current.startStoryboardDrag(1, { x: 50, y: 50 });
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    expect(mocks.reorderStoryboardMember).not.toHaveBeenCalled();
  });
});
