// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasAsset } from '@/modules/creative_canvas/domain/canvasAsset';

import {
  useGroupNodeController,
  type GroupNodeControllerPorts,
  type GroupNodePresentationData,
  type GroupNodeScopedNode,
  type StoryboardCellPreview,
} from './useGroupNodeController';

const projectionMocks = vi.hoisted(() => ({
  status: null as { stale: boolean } | null,
  useStatus: vi.fn(),
}));

vi.mock('./useCanvasProjectionStatus', () => ({
  useCanvasProjectionStatus: (projectionKey: string | null) => {
    projectionMocks.useStatus(projectionKey);
    return projectionMocks.status;
  },
}));

interface TestNode extends GroupNodeScopedNode {
  data: Record<string, unknown>;
}

function data(
  patch: Partial<GroupNodePresentationData> = {},
): GroupNodePresentationData {
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
  type = 'uploadNode',
  nodeData = {},
}: {
  id: string;
  parentId?: string;
  x?: number;
  y?: number;
  type?: string;
  nodeData?: Record<string, unknown>;
}): TestNode {
  return {
    id,
    parentId,
    type,
    position: { x, y },
    data: nodeData,
  };
}

function createPorts(): GroupNodeControllerPorts {
  return {
    translate: vi.fn(
      (key: string, options?: Record<string, unknown>) =>
        typeof options?.count === 'number'
          ? `${key}:${options.count}`
          : key,
    ),
    uploadAsset: vi.fn(
      async (_projectId: string, file: File, _displayName: string) => ({
        url: `/uploaded/${file.name}`,
      }),
    ),
    notify: vi.fn(),
    reportUploadError: vi.fn(),
    updateNodeData: vi.fn(),
    fitGroupToChildren: vi.fn(),
    reorderStoryboardMember: vi.fn(),
    addStoryboardMembers: vi.fn(),
    deleteNode: vi.fn(),
    resolveGroupTitle: vi.fn(
      (groupData) => groupData.displayName ?? groupData.label ?? '',
    ),
    resolveStoryboardCellPreview: vi.fn((candidate): StoryboardCellPreview => {
      const nodeData = candidate.data as Record<string, unknown>;
      const isVideo = candidate.type === 'videoNode';
      return {
        nodeId: candidate.id,
        kind: isVideo ? 'video' : 'image',
        imageUrl:
          (isVideo ? nodeData.previewImageUrl : nodeData.imageUrl) as
            | string
            | null,
        label: '',
      };
    }),
    computeSnapAlign: vi.fn((_draggedNode, proposedPosition) => ({
      position: proposedPosition,
      guides: { vertical: [100], horizontal: [] },
    })),
    getViewportZoom: vi.fn(() => 2),
    setSnapGuides: vi.fn(),
    clearSnapGuides: vi.fn(),
  };
}

describe('useGroupNodeController', () => {
  let nodes: TestNode[];
  let ports: GroupNodeControllerPorts;

  beforeEach(() => {
    nodes = [];
    ports = createPorts();
    projectionMocks.status = null;
    projectionMocks.useStatus.mockReset();
  });

  function renderController(
    groupData: GroupNodePresentationData,
    options: { selected?: boolean; isInteracting?: boolean } = {},
  ) {
    return renderHook(() =>
      useGroupNodeController({
        id: 'group-a',
        data: groupData,
        projectId: 'project-a',
        selected: options.selected,
        groupScopedNodes: nodes,
        isInteracting: options.isInteracting ?? false,
        snapEnabled: true,
        ports,
      }),
    );
  }

  it('projects storyboard members in reading order and owns node commands', () => {
    nodes.push(
      node({ id: 'group-a', x: 100, y: 200, type: 'groupNode' }),
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
        type: 'videoNode',
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
    projectionMocks.status = { stale: true };
    const { result } = renderController(
      data({
        storyboardGroup: true,
        storyboardCols: 2,
        storyboardShowIndex: true,
        projection_key: ' projection-a ',
      }),
      { selected: true },
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
    expect(projectionMocks.useStatus).toHaveBeenCalledWith('projection-a');
    expect(ports.fitGroupToChildren).not.toHaveBeenCalled();

    act(() => result.current.rename('新分镜组'));
    expect(ports.updateNodeData).toHaveBeenCalledWith('group-a', {
      displayName: '新分镜组',
      label: '新分镜组',
    });
  });

  it('auto-fits only plain groups outside an active drag interaction', () => {
    nodes.push(
      node({ id: 'group-a', type: 'groupNode' }),
      node({ id: 'child-a', parentId: 'group-a', x: 20, y: 30 }),
    );
    const plain = renderController(
      data({ user_spawned: true, projection_key: 'ignored' }),
    );

    expect(plain.result.current).toMatchObject({
      isStoryboard: false,
      showIndex: false,
      headerTitle: '组',
    });
    expect(plain.result.current.storyboardCells).toEqual([]);
    expect(ports.fitGroupToChildren).toHaveBeenCalledWith('group-a');
    expect(projectionMocks.useStatus).toHaveBeenCalledWith(null);
    plain.unmount();

    vi.mocked(ports.fitGroupToChildren).mockReset();
    const interacting = renderController(data(), { isInteracting: true });
    expect(ports.fitGroupToChildren).not.toHaveBeenCalled();
    interacting.unmount();
  });

  it('uploads image files and projects selected history assets into members', async () => {
    nodes.push(node({ id: 'group-a', type: 'groupNode' }));
    const { result } = renderController(data({ storyboardGroup: true }));
    const image = new File(['image'], 'frame.png', { type: 'image/png' });
    const text = new File(['text'], 'notes.txt', { type: 'text/plain' });

    await act(async () => {
      await result.current.uploadLocalFiles(
        [image, text] as unknown as FileList,
      );
    });
    expect(ports.uploadAsset).toHaveBeenCalledOnce();
    expect(ports.uploadAsset).toHaveBeenCalledWith(
      'project-a',
      image,
      'frame.png',
    );
    expect(ports.addStoryboardMembers).toHaveBeenCalledWith('group-a', [
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
    expect(ports.notify).toHaveBeenCalledWith(
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
    expect(ports.addStoryboardMembers).toHaveBeenLastCalledWith('group-a', [
      {
        imageUrl: '/history/full.png',
        previewImageUrl: '/history/preview.webp',
        displayName: '历史画面',
      },
    ]);
  });

  it('converts screen drag distance by zoom and commits only changed slots', () => {
    nodes.push(
      node({ id: 'group-a', x: 100, y: 200, type: 'groupNode' }),
      node({
        id: 'image-a',
        parentId: 'group-a',
        nodeData: { imageUrl: '/a.png' },
      }),
      node({
        id: 'image-b',
        parentId: 'group-a',
        x: 10,
        nodeData: { imageUrl: '/b.png' },
      }),
    );
    const { result } = renderController(
      data({ storyboardGroup: true, storyboardCols: 2 }),
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
    expect(ports.setSnapGuides).toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    expect(ports.reorderStoryboardMember).toHaveBeenCalledWith(
      'group-a',
      0,
      1,
    );
    expect(ports.clearSnapGuides).toHaveBeenCalledOnce();
    expect(result.current.isDragging).toBe(false);

    vi.mocked(ports.reorderStoryboardMember).mockReset();
    act(() => {
      result.current.startStoryboardDrag(1, { x: 50, y: 50 });
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    expect(ports.reorderStoryboardMember).not.toHaveBeenCalled();
  });
});
