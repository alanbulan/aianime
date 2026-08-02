// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComposeTimelineState } from '@/modules/creative_canvas/public';
import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type VideoComposeNodeData,
} from '@/features/canvas/domain/canvasNodes';

import { useVideoComposeNodeController } from './useVideoComposeNodeController';

const mocks = vi.hoisted(() => ({
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  updateNodeInternals: vi.fn(),
  findNodePosition: vi.fn(),
  addNode: vi.fn(),
  addEdge: vi.fn(),
  setResultSelectedNode: vi.fn(),
  requestFocusNode: vi.fn(),
  upstreamNodes: [] as CanvasNode[],
  translate: vi.fn((key: string, values?: { min?: number }) =>
    values?.min == null ? key : `${key}:${values.min}`),
}));

vi.mock('@xyflow/react', () => ({
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.translate }),
}));

vi.mock('@/features/canvas/canvasStore', () => {
  const useCanvasStore = Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector({
      setSelectedNode: mocks.setSelectedNode,
      updateNodeData: mocks.updateNodeData,
    }),
    {
      getState: () => ({
        findNodePosition: mocks.findNodePosition,
        addNode: mocks.addNode,
        addEdge: mocks.addEdge,
        setSelectedNode: mocks.setResultSelectedNode,
        requestFocusNode: mocks.requestFocusNode,
      }),
    },
  );
  return { useCanvasStore };
});

vi.mock('@/features/canvas/hooks/useUpstreamGraph', () => ({
  useUpstreamNodes: () => mocks.upstreamNodes,
}));

function data(patch: Partial<VideoComposeNodeData> = {}): VideoComposeNodeData {
  return { displayName: '视频合成', ...patch };
}

function mediaNode({
  id,
  type,
  y,
  url,
}: {
  id: string;
  type: typeof CANVAS_NODE_TYPES.video | typeof CANVAS_NODE_TYPES.audio;
  y: number;
  url: string;
}): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y },
    data: type === CANVAS_NODE_TYPES.video
      ? { videoUrl: url }
      : { audioUrl: url },
  } as CanvasNode;
}

const timeline: ComposeTimelineState = {
  tracks: [],
  resolution: '1080p',
};

describe('useVideoComposeNodeController', () => {
  beforeEach(() => {
    mocks.setSelectedNode.mockReset();
    mocks.updateNodeData.mockReset();
    mocks.updateNodeInternals.mockReset();
    mocks.findNodePosition.mockReset().mockReturnValue({ x: 600, y: 400 });
    mocks.addNode.mockReset().mockReturnValue('video-result');
    mocks.addEdge.mockReset();
    mocks.setResultSelectedNode.mockReset();
    mocks.requestFocusNode.mockReset();
    mocks.upstreamNodes.splice(0);
    mocks.translate.mockClear();
  });

  it('projects sorted inputs, draft, labels, and node commands', () => {
    mocks.upstreamNodes.push(
      mediaNode({ id: 'video-b', type: CANVAS_NODE_TYPES.video, y: 80, url: '/b.mp4' }),
      mediaNode({ id: 'audio-a', type: CANVAS_NODE_TYPES.audio, y: 10, url: '/a.wav' }),
      mediaNode({ id: 'video-a', type: CANVAS_NODE_TYPES.video, y: 40, url: '/a.mp4' }),
    );
    const { result } = renderHook(() => useVideoComposeNodeController({
      id: 'compose-a',
      data: data({ draftTimeline: timeline }),
      projectId: 'project-a',
      canvasId: 'canvas-a',
      selected: true,
    }));

    expect(result.current).toMatchObject({
      id: 'compose-a',
      selected: true,
      title: '视频合成',
      size: { width: 240, height: 136 },
      seedNodeIds: ['audio-a', 'video-a', 'video-b'],
      sourceMedia: [
        {
          nodeId: 'audio-a',
          kind: 'audio',
          sourceUrl: '/a.wav',
          displayName: null,
          thumbUrl: null,
          durationMs: null,
        },
        {
          nodeId: 'video-a',
          kind: 'video',
          sourceUrl: '/a.mp4',
          displayName: null,
          thumbUrl: null,
          durationMs: null,
        },
        {
          nodeId: 'video-b',
          kind: 'video',
          sourceUrl: '/b.mp4',
          displayName: null,
          thumbUrl: null,
          durationMs: null,
        },
      ],
      videoCount: 2,
      canOpen: true,
      project: 'project-a',
      canvasId: 'canvas-a',
      initialTimeline: timeline,
      openLabel: 'videoCompose.node.open',
      hintText: 'videoCompose.node.hint:2',
    });
    expect(mocks.updateNodeInternals).toHaveBeenCalledWith('compose-a');

    act(() => result.current.select());
    act(() => result.current.rename('新合成'));
    expect(mocks.setSelectedNode).toHaveBeenCalledWith('compose-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('compose-a', {
      displayName: '新合成',
    });
  });

  it('opens only with enough videos, then closes explicitly', () => {
    mocks.upstreamNodes.push(
      mediaNode({ id: 'video-a', type: CANVAS_NODE_TYPES.video, y: 0, url: '/a.mp4' }),
      mediaNode({ id: 'video-b', type: CANVAS_NODE_TYPES.video, y: 10, url: '/b.mp4' }),
    );
    const opened = renderHook(() => useVideoComposeNodeController({
      id: 'compose-open',
      data: data(),
      projectId: 'project-a',
      canvasId: 'canvas-a',
    }));
    act(() => opened.result.current.openEditor());
    expect(opened.result.current.isEditorOpen).toBe(true);
    act(() => opened.result.current.closeEditor());
    expect(opened.result.current.isEditorOpen).toBe(false);
    opened.unmount();
  });

  it('persists editor drafts through the node store', () => {
    const { result } = renderHook(() => useVideoComposeNodeController({
      id: 'compose-draft',
      data: data(),
      projectId: 'project-a',
      canvasId: 'canvas-a',
    }));

    act(() => result.current.persistDraft(timeline));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('compose-draft', {
      draftTimeline: timeline,
    });
  });

  it('creates, connects, selects, and focuses the composed video result', () => {
    const { result } = renderHook(() => useVideoComposeNodeController({
      id: 'compose-result',
      data: data(),
      projectId: 'project-a',
      canvasId: 'canvas-explicit',
    }));

    expect(result.current.canvasId).toBe('canvas-explicit');
    act(() => result.current.completeComposition(
      '/result.mp4',
      '/cover.jpg',
    ));

    expect(mocks.findNodePosition).toHaveBeenCalledWith(
      'compose-result',
      580,
      380,
    );
    expect(mocks.addNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.video,
      { x: 600, y: 400 },
      {
        videoUrl: '/result.mp4',
        previewImageUrl: '/cover.jpg',
        displayName: 'videoCompose.node.resultName',
        sourceFileName: null,
      },
    );
    expect(mocks.addEdge).toHaveBeenCalledWith(
      'compose-result',
      'video-result',
    );
    expect(mocks.setResultSelectedNode).toHaveBeenCalledWith('video-result');
    expect(mocks.requestFocusNode).toHaveBeenCalledWith('video-result');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('compose-result', {
      resultVideoUrl: '/result.mp4',
      previewImageUrl: '/cover.jpg',
    });
    expect(result.current.isEditorOpen).toBe(false);
  });
});
