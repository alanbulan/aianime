// Copyright (c) 2026 AI anime
import type { SyntheticEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type ImageEditNodeData,
} from '@/features/canvas/domain/canvasNodes';

import { useImageNodeController } from './useImageNodeController';

const mocks = vi.hoisted(() => ({
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  updateNodeSize: vi.fn(),
  updateNodeInternals: vi.fn(),
  collectCandidateBindingsForNode: vi.fn(),
  regenerateExportImageNode: vi.fn(async (_params: unknown) => undefined),
  canRetry: false,
  isGenerating: false,
  zoom: 1,
  edges: [] as Array<{
    id: string;
    source: string;
    target: string;
  }>,
  translate: vi.fn((key: string, options?: { minutes?: number }) =>
    options?.minutes == null ? key : `${key}:${options.minutes}`),
}));

vi.mock('@xyflow/react', () => ({
  useStore: (selector: (state: { transform: [number, number, number] }) => unknown) =>
    selector({ transform: [0, 0, mocks.zoom] }),
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
}));

vi.mock('zustand/react/shallow', () => ({
  useShallow: <T,>(selector: T) => selector,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.translate }),
}));

vi.mock('@/features/canvas/canvasStore', () => ({
  useCanvasStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setSelectedNode: mocks.setSelectedNode,
      updateNodeData: mocks.updateNodeData,
      updateNodeSize: mocks.updateNodeSize,
      edges: mocks.edges,
    }),
}));

vi.mock('@/features/canvas/hooks/useNodeGenerationTaskState', () => ({
  useNodeGenerationTaskState: () => ({
    isGenerating: mocks.isGenerating,
  }),
}));

vi.mock('@/shared/media/image-cache', () => ({
  withImageCacheBust: (
    url: string,
    token: string | number | null | undefined,
  ) => token == null ? url : `${url}?stamp=${token}`,
}));

vi.mock('@/features/canvas/application/regenerateExportNode', () => ({
  canRegenerateExportImageNode: () => mocks.canRetry,
}));

vi.mock('@/features/canvas/composition', () => ({
  regenerateExportImageNode: (params: unknown) =>
    mocks.regenerateExportImageNode(params),
}));

vi.mock('@/modules/creative_canvas/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/creative_canvas/public')>()),
  collectCandidateBindingsForNode: (edges: unknown, nodeId: string) =>
    mocks.collectCandidateBindingsForNode(edges, nodeId),
  hasMainlineContexts: (contexts: unknown) => Boolean(contexts),
  resolveImageDisplayUrl: (url: string) => `display:${url}`,
  shouldUseOriginalImageByZoom: (zoom: number) => zoom >= 1.45,
}));

function data(patch: Partial<ImageEditNodeData> = {}): ImageEditNodeData {
  return {
    imageUrl: null,
    aspectRatio: '1:1',
    prompt: '',
    model: 'image-model',
    size: '1K',
    displayName: '图像节点',
    ...patch,
  };
}

function imageLoadEvent(
  naturalWidth: number,
  naturalHeight: number,
): SyntheticEvent<HTMLImageElement> {
  return {
    currentTarget: { naturalWidth, naturalHeight },
  } as unknown as SyntheticEvent<HTMLImageElement>;
}

describe('useImageNodeController', () => {
  beforeEach(() => {
    mocks.setSelectedNode.mockReset();
    mocks.updateNodeData.mockReset();
    mocks.updateNodeSize.mockReset();
    mocks.updateNodeInternals.mockReset();
    mocks.collectCandidateBindingsForNode.mockReset().mockReturnValue([{
      role: 'current_frame',
    }]);
    mocks.regenerateExportImageNode.mockReset().mockResolvedValue(undefined);
    mocks.canRetry = false;
    mocks.isGenerating = false;
    mocks.zoom = 1;
    mocks.edges.splice(0);
    mocks.translate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('projects size, preview media, bindings, and store commands', () => {
    mocks.edges.push(
      { id: 'edge-a', source: 'upstream', target: 'image-a' },
      { id: 'edge-b', source: 'other-a', target: 'other-b' },
    );
    const nodeData = data({
      imageUrl: '/original.png',
      previewImageUrl: '/preview.webp',
      aspectRatio: '16:9',
      committed_at: 'version-1',
      imageNaturalWidth: 1920,
      imageNaturalHeight: 1080,
      mainline_context: [{ kind: 'frame' }],
    });
    const { result } = renderHook(() => useImageNodeController({
      projectId: 'project-a',
      canvasId: 'canvas-a',
      id: 'image-a',
      data: nodeData,
      type: CANVAS_NODE_TYPES.exportImage,
      selected: true,
      width: 400.4,
      height: 225.6,
    }));

    expect(result.current).toMatchObject({
      id: 'image-a',
      selected: true,
      isExportResultNode: true,
      title: '图像节点',
      hasMainlineContext: true,
      candidateBindingRoles: ['current_frame'],
      naturalSize: { width: 1920, height: 1080 },
      imageSource: 'display:/preview.webp?stamp=version-1',
      originalImageUrl: 'display:/original.png',
      waitingResultText: 'node.imageNode.waitingResult',
      size: {
        width: 400,
        height: 226,
        resizeMinWidth: 249,
        resizeMinHeight: 140,
        maxWidth: 1600,
        maxHeight: 1600,
      },
    });
    expect(mocks.collectCandidateBindingsForNode).toHaveBeenCalledWith(
      [{ id: 'edge-a', source: 'upstream', target: 'image-a' }],
      'image-a',
    );
    expect(mocks.updateNodeInternals).toHaveBeenCalledWith('image-a');

    act(() => result.current.select());
    act(() => result.current.rename('新图像'));
    expect(mocks.setSelectedNode).toHaveBeenCalledWith('image-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('image-a', {
      displayName: '新图像',
    });
  });

  it('switches to the original image above the zoom threshold', () => {
    mocks.zoom = 2;
    const { result } = renderHook(() => useImageNodeController({
      projectId: 'project-a',
      canvasId: 'canvas-a',
      id: 'image-zoom',
      data: data({
        imageUrl: '/original.png',
        previewImageUrl: '/preview.webp',
      }),
      type: CANVAS_NODE_TYPES.exportImage,
    }));

    expect(result.current.imageSource).toBe('display:/original.png');
  });

  it('projects delayed generation status and owns the refresh timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T00:00:00Z'));
    mocks.isGenerating = true;
    const { result, unmount } = renderHook(() => useImageNodeController({
      projectId: 'project-a',
      canvasId: 'canvas-a',
      id: 'image-generating',
      data: data({
        generationStartedAt: Date.now() - 120000,
        generationDurationMs: 90000,
      }),
      type: CANVAS_NODE_TYPES.exportImage,
    }));

    expect(result.current.waitingResultText).toBe(
      'node.imageNode.waitingResultDelayed:2',
    );
    expect(result.current.generationStartedAt).toBe(Date.now() - 120000);
    expect(result.current.generationDurationMs).toBe(90000);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('projects export failures and delegates retry through composition', async () => {
    mocks.canRetry = true;
    const nodeData = data({
      generationError: '  图像失败  ',
      generationErrorRequestId: 'request-551',
      generationRequestPayload: { prompt: 'retry' },
    });
    const { result } = renderHook(() => useImageNodeController({
      projectId: 'project-a',
      canvasId: 'canvas-a',
      id: 'image-failed',
      data: nodeData,
      type: CANVAS_NODE_TYPES.exportImage,
    }));

    expect(result.current).toMatchObject({
      hasGenerationError: true,
      generationError: '图像失败',
      generationErrorRequestId: 'request-551',
      generationFailedLabel: 'node.imageNode.generationFailed',
      canRetry: true,
    });
    await act(async () => {
      await result.current.retry();
    });
    expect(mocks.regenerateExportImageNode).toHaveBeenCalledWith({
      projectId: 'project-a',
      canvasId: 'canvas-a',
      nodeData,
      nodeId: 'image-failed',
      updateNodeData: mocks.updateNodeData,
    });
  });

  it('records natural dimensions and fits the node to a changed aspect ratio', () => {
    const { result } = renderHook(() => useImageNodeController({
      projectId: 'project-a',
      canvasId: 'canvas-a',
      id: 'image-loaded',
      data: data({ imageUrl: '/image.png' }),
      type: CANVAS_NODE_TYPES.exportImage,
      width: 300,
      height: 300,
    }));

    act(() => result.current.handleImageLoad(imageLoadEvent(1920, 1080)));

    expect(result.current.naturalSize).toEqual({ width: 1920, height: 1080 });
    expect(mocks.updateNodeSize).toHaveBeenCalledWith(
      'image-loaded',
      { width: 533, height: 300 },
      {
        lockManualSize: undefined,
        data: {
          aspectRatio: '16:9',
          imageNaturalWidth: 1920,
          imageNaturalHeight: 1080,
          imageAspectRatioUpdatedAt: expect.any(Number),
        },
      },
    );
  });

  it('preserves a manually adjusted size while refreshing its resolution', () => {
    const { result } = renderHook(() => useImageNodeController({
      projectId: 'project-a',
      canvasId: 'canvas-a',
      id: 'image-manual',
      data: data({
        imageUrl: '/image.png',
        isSizeManuallyAdjusted: true,
      }),
      type: CANVAS_NODE_TYPES.exportImage,
      width: 420,
      height: 420,
    }));

    act(() => result.current.handleImageLoad(imageLoadEvent(1600, 900)));

    expect(result.current.naturalSize).toEqual({ width: 1600, height: 900 });
    expect(mocks.updateNodeSize).not.toHaveBeenCalled();
  });
});
