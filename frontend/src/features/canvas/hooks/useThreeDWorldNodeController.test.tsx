// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CanvasNode, type ThreeDWorldNodeData } from '@/features/canvas/domain/canvasNodes';
import type { ThreeDDirectorCaptureMeta, ThreeDSceneSnapshot } from '@/features/viewer-kit/public';
import { useThreeDWorldNodeController } from './useThreeDWorldNodeController';

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
const mocks = vi.hoisted(() => ({
  updateNodeInternals: vi.fn(),
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  addPanoCaptureGroup: vi.fn(),
  detachUpstream: vi.fn(),
  refreshHistory: vi.fn(),
  generateImageTo3d: vi.fn(),
  getBeatManifest: vi.fn(),
  getDirectorPalette: vi.fn(),
  commitBackground: vi.fn(),
  uploadAsset: vi.fn(),
  uploadLocalImage: vi.fn(),
  registerSaveHandler: vi.fn(),
  blobToDataUrl: vi.fn(),
  readImageSize: vi.fn(),
  storeNodes: [] as Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: unknown;
  }>,
  upstreamNodes: [] as Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: unknown;
  }>,
  historyRecords: [] as Array<Record<string, unknown>>,
  isGenerating: false,
}));

const NODE_CONTEXT = {
  projectId: 'project-a',
  canvasId: 'canvas-a',
} as const;

vi.mock('@xyflow/react', () => ({
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key === 'viewer.threeD.directorWorld'
        ? '导演世界'
        : String(options?.defaultValue ?? key),
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

vi.mock('@/features/canvas/canvasStore', () => {
  const state = () => ({
    nodes: mocks.storeNodes,
    setSelectedNode: mocks.setSelectedNode,
    updateNodeData: mocks.updateNodeData,
    addPanoCaptureGroup: mocks.addPanoCaptureGroup,
  });
  const useCanvasStore = (
    selector: (value: ReturnType<typeof state>) => unknown,
  ) => selector(state());
  useCanvasStore.getState = state;
  return { useCanvasStore };
});

vi.mock('@/features/canvas/composition', () => ({
  getCanvasBeatDirectorManifest: (...args: unknown[]) =>
    mocks.getBeatManifest(...args),
  getCanvasDirectorStagePalette: (...args: unknown[]) =>
    mocks.getDirectorPalette(...args),
  uploadAndAutoCommitSelectedBackgroundCandidate: (...args: unknown[]) =>
    mocks.commitBackground(...args),
  uploadCanvasAsset: (...args: unknown[]) => mocks.uploadAsset(...args),
  uploadLocalImageToBackend: (...args: unknown[]) =>
    mocks.uploadLocalImage(...args),
  useDetachUpstream: () => mocks.detachUpstream,
  useUpstreamNodes: () => mocks.upstreamNodes,
}));

vi.mock('@/modules/creative_canvas/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/creative_canvas/public')>()),
  useNodeGenerationHistory: () => ({
    records: mocks.historyRecords,
    isLoading: false,
    refresh: mocks.refreshHistory,
  }),
  useNodeGenerationTaskState: () => ({
    isGenerating: mocks.isGenerating,
  }),
  generateCanvasImageTo3d: (...args: unknown[]) =>
    mocks.generateImageTo3d(...args),
  directorCaptureBlobToDataUrl: (...args: unknown[]) =>
    mocks.blobToDataUrl(...args),
  readDirectorCaptureImageSize: (...args: unknown[]) =>
    mocks.readImageSize(...args),
  setDirectorWorldSceneSaveHandler: (...args: unknown[]) =>
    mocks.registerSaveHandler(...args),
}));

function uploadNode(
  id: string,
  y: number,
  data: Record<string, unknown>,
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y },
    data,
  } as CanvasNode;
}

describe('useThreeDWorldNodeController', () => {
  beforeEach(() => {
    mocks.storeNodes.splice(0);
    mocks.upstreamNodes.splice(0);
    mocks.historyRecords.splice(0);
    mocks.isGenerating = false;
    for (const mock of [
      mocks.updateNodeInternals,
      mocks.setSelectedNode,
      mocks.updateNodeData,
      mocks.addPanoCaptureGroup,
      mocks.detachUpstream,
      mocks.refreshHistory,
      mocks.generateImageTo3d,
      mocks.getBeatManifest,
      mocks.getDirectorPalette,
      mocks.commitBackground,
      mocks.uploadAsset,
      mocks.uploadLocalImage,
      mocks.registerSaveHandler,
      mocks.blobToDataUrl,
      mocks.readImageSize,
    ]) {
      mock.mockReset();
    }
    mocks.refreshHistory.mockResolvedValue(undefined);
    mocks.generateImageTo3d.mockResolvedValue({
      source: {
        id: 'generated',
        source_type: 'sog',
        source_kind: 'custom',
        ply_url: '/generated.sog',
      },
    });
    mocks.getDirectorPalette.mockResolvedValue({
      actors: [],
      props: [],
      anonymous_colors: [],
      anonymous_prop_colors: [],
    });
    mocks.addPanoCaptureGroup.mockReturnValue('group-a');
    mocks.uploadAsset.mockImplementation(
      (_project: string, _blob: Blob, filename: string) =>
        Promise.resolve({ filename, url: `/uploads/${filename}` }),
    );
    mocks.uploadLocalImage.mockResolvedValue('/uploads/capture.png');
    mocks.blobToDataUrl.mockResolvedValue('data:image/png;base64,AAAA');
    mocks.readImageSize.mockResolvedValue({ width: 1280, height: 720 });
  });

  afterEach(() => vi.restoreAllMocks());

  it('projects references and owns local selection, rename, and history commands', () => {
    mocks.upstreamNodes.push(
      uploadNode('image-a', 100, {
        displayName: '普通图',
        imageUrl: '/a.png',
      }),
      uploadNode('image-b', 0, {
        displayName: '全景图',
        imageUrl: '/b.png',
        aspectRatio: '2:1',
      }),
    );
    const data: ThreeDWorldNodeData = {
      displayName: '3D 世界',
      sourceNodeId: 'image-a',
    };
    const { result } = renderHook(() =>
      useThreeDWorldNodeController({
        ...NODE_CONTEXT,
        id: 'world-a',
        data,
        selected: true,
        width: 500,
      }),
    );

    expect(result.current.size).toEqual({ width: 500, height: 210 });
    expect(result.current.title).toBe('导演世界');
    expect(result.current.referenceImages.map((item) => item.nodeId)).toEqual([
      'image-b',
      'image-a',
    ]);
    expect(result.current.selectedReferenceNodeId).toBe('image-a');

    act(() => {
      result.current.select();
      result.current.rename('新标题');
      result.current.changeReferenceImage('image-b');
      result.current.changeSourceKind('master');
      result.current.restoreHistory({
        id: 'history-a',
        result: { asset_url: '/history.sog' },
      } as never);
    });

    expect(mocks.setSelectedNode).toHaveBeenCalledWith('world-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('world-a', {
      displayName: '新标题',
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('world-a', {
      sourceNodeId: 'image-b',
      plyKind: 'pano',
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'world-a',
      expect.objectContaining({ plyUrl: '/history.sog' }),
    );
    expect(mocks.updateNodeInternals).toHaveBeenCalledWith('world-a');
  });

  it('submits the selected upstream image and publishes the generated source', async () => {
    const source = uploadNode('image-a', 0, {
      imageUrl: '/source.png',
      aspectRatio: '16:9',
    });
    mocks.upstreamNodes.push(source);
    const data: ThreeDWorldNodeData = { sourceNodeId: 'image-a' };
    mocks.storeNodes.push({
      id: 'world-a',
      type: CANVAS_NODE_TYPES.threeDWorld,
      position: { x: 0, y: 0 },
      data,
    });
    const { result } = renderHook(() =>
      useThreeDWorldNodeController({
        ...NODE_CONTEXT,
        id: 'world-a',
        data,
        selected: true,
      }),
    );

    await act(async () => result.current.submitGeneration());

    expect(mocks.generateImageTo3d).toHaveBeenCalledWith(
      {
        projectId: 'project-a',
        sourceUrl: '/source.png',
        sourceKind: 'master',
        canvasId: 'canvas-a',
        nodeId: 'world-a',
      },
      expect.any(Function),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'world-a',
      expect.objectContaining({
        isGenerating: true,
        previewImageUrl: '/source.png',
      }),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'world-a',
      expect.objectContaining({
        activeSourceId: 'generated',
        plyUrl: '/generated.sog',
        isGenerating: false,
      }),
    );
    expect(mocks.refreshHistory).toHaveBeenCalled();
  });

  it('falls back to a local beat manifest and writes scene lifecycle patches', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.getBeatManifest.mockRejectedValue(new Error('offline'));
    const data: ThreeDWorldNodeData = {
      displayName: '世界 A',
      mainline_context: [
        {
          kind: 'beat',
          projectId: 'project-a',
          episode: 1,
          beat: 2,
        },
      ],
      sources: [
        {
          id: 'source-a',
          source_type: 'sog',
          ply_url: '/world.sog',
        },
      ],
    };
    const { result } = renderHook(() =>
      useThreeDWorldNodeController({
        ...NODE_CONTEXT,
        id: 'world-a',
        data,
        selected: true,
      }),
    );

    await act(async () => result.current.openDirector());

    expect(mocks.getBeatManifest).toHaveBeenCalledWith({
      projectId: 'project-a',
      episode: 1,
      beat: 2,
    });
    expect(mocks.getDirectorPalette).toHaveBeenCalledWith({
      projectId: 'project-a',
    });
    expect(result.current.directorDialogOpen).toBe(true);
    expect(result.current.directorManifest?.beat_context).toMatchObject({
      episode: 1,
      beat: 2,
    });

    const snapshot = {
      world: { activeSourceId: 'source-a' },
    } as ThreeDSceneSnapshot;
    const saveHandler = vi.fn().mockResolvedValue(undefined);
    act(() => result.current.registerSaveSceneHandler(saveHandler));
    await act(async () => result.current.saveScene(snapshot));
    await act(async () => result.current.clearScene('source-a'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'world-a',
      expect.objectContaining({
        scene: snapshot,
        activeSourceId: 'source-a',
      }),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'world-a',
      expect.objectContaining({ scenesBySourceId: {} }),
    );
    expect(mocks.registerSaveHandler).toHaveBeenCalledWith(
      'world-a',
      saveHandler,
    );
  });

  it('uploads both Director capture layers and creates one guarded output group', async () => {
    const data: ThreeDWorldNodeData = {};
    const { result } = renderHook(() =>
      useThreeDWorldNodeController({
        ...NODE_CONTEXT,
        id: 'world-a',
        data,
        selected: true,
      }),
    );
    const meta = {
      kind: 'combined',
      source: { source_kind: 'custom' },
      snapshot: { world: {} },
      captureBundle: {
        combined: new Blob(['combined']),
        env_only: new Blob(['env']),
        frame_meta: { source: { source_kind: 'custom' } },
      },
    } as unknown as ThreeDDirectorCaptureMeta;

    await act(async () =>
      result.current.captureCanvasNode(new Blob(['fallback']), meta),
    );

    expect(mocks.uploadAsset).toHaveBeenCalledTimes(3);
    expect(mocks.addPanoCaptureGroup).toHaveBeenCalledWith(
      'world-a',
      [
        expect.objectContaining({ label: '导演合成图' }),
        expect.objectContaining({ label: '纯背景图' }),
      ],
      { cols: 2, groupName: '导演世界输出' },
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith('world-a', {
      scene: meta.snapshot,
      errorMessage: null,
    });
  });
});
