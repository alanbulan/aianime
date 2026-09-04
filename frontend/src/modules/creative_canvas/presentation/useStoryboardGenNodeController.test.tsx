// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoryboardGenNodeData } from '../domain/canvasNodeData';
import {
  createUseStoryboardGenNodeController,
  type StoryboardGenNodeSettingsStore,
  type StoryboardGenNodeSettingsStoreHook,
  type StoryboardGenNodeStore,
  type StoryboardGenNodeStoreHook,
} from './useStoryboardGenNodeController';
const mocks = vi.hoisted(() => ({
  zoom: 1,
  upstreamImages: [] as string[],
  settings: {
    storyboardGenKeepStyleConsistent: true,
    storyboardGenDisableTextInImage: true,
    storyboardGenAutoInferEmptyFrame: true,
    ignoreAtTagWhenCopyingAndGenerating: true,
    enableStoryboardGenGridPreviewShortcut: false,
    showStoryboardGenAdvancedRatioControls: false,
  },
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  addNode: vi.fn(),
  addEdge: vi.fn(),
  findNodePosition: vi.fn(),
  updateNodeInternals: vi.fn(),
  detectAspectRatio: vi.fn(),
  getRuntimeDiagnostics: vi.fn(),
  showErrorDialog: vi.fn(),
  uploadLocalImageToBackend: vi.fn(),
  submitGenerateImageJob: vi.fn(),
  generateGridImage: vi.fn(),
  resolvePointerAnchor: vi.fn(),
  resolvePickerAnchor: vi.fn(),
  backendErrorToastMessage: vi.fn(),
  imageModel: {
    id: 'model-a',
    mediaType: 'image',
    displayName: '模型 A',
    description: '',
    eta: '',
    expectedDurationMs: 45000,
    defaultAspectRatio: '1:1',
    defaultResolution: '1K',
    aspectRatios: [
      { value: '1:1', label: '1:1' },
      { value: '16:9', label: '16:9' },
      { value: '21:9', label: '21:9' },
    ],
    resolutions: [{ value: '1K', label: '1K' }],
    resolveRequest: () => ({
      requestModel: 'request-model-a',
      modeLabel: 'A',
    }),
  },
}));

vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top' },
  useViewport: () => ({ zoom: mocks.zoom }),
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, options?: Record<string, unknown>) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));


vi.mock('../application/generationErrorReport', () => ({
  buildGenerationErrorReport: () => '错误报告',
  createReferenceImagePlaceholders: (count: number) =>
    Array.from({ length: count }, (_, index) => `image-${index + 1}`),
  resolveGenerationErrorDiagnostics: () => ({
    details: '诊断详情',
    requestId: 'request-a',
  }),
}));

vi.mock('../application/errorDialog', () => ({
  resolveErrorContent: () => ({ message: '生成失败', details: '诊断详情' }),
}));

vi.mock('../application/imageModelCatalogProjection', () => ({
  imageModelDefinitions: () => [mocks.imageModel],
  resolveImageModelResolution: () => mocks.imageModel.resolutions[0],
  resolveImageModelResolutions: () => mocks.imageModel.resolutions,
  selectImageModel: () => mocks.imageModel,
}));

const useStore = ((selector: (state: StoryboardGenNodeStore) => unknown) =>
  selector({
    setSelectedNode: mocks.setSelectedNode,
    updateNodeData: mocks.updateNodeData,
    addNode: mocks.addNode,
    addEdge: mocks.addEdge,
    findNodePosition: mocks.findNodePosition,
  })) as unknown as StoryboardGenNodeStoreHook;

const useSettingsStore = ((selector: (state: StoryboardGenNodeSettingsStore) => unknown) =>
  selector(mocks.settings as unknown as StoryboardGenNodeSettingsStore)) as unknown as StoryboardGenNodeSettingsStoreHook;

const useStoryboardGenNodeController = createUseStoryboardGenNodeController({
  useStore,
  useSettingsStore,
  CURRENT_RUNTIME_SESSION_ID: 'session-a',
  canvasAiGateway: {
    submitGenerateImageJob: (...args: unknown[]) =>
      mocks.submitGenerateImageJob(...args),
  } as unknown as Parameters<
    typeof createUseStoryboardGenNodeController
  >[0]['canvasAiGateway'],
  detectAspectRatio: (...args: unknown[]) => mocks.detectAspectRatio(...args),
  getRuntimeDiagnostics: () => mocks.getRuntimeDiagnostics(),
  showErrorDialog: (...args: unknown[]) => mocks.showErrorDialog(...args),
  uploadLocalImageToBackend: (...args: unknown[]) =>
    mocks.uploadLocalImageToBackend(...args),
  useUpstreamImages: () => mocks.upstreamImages,
  useCanvasImageModels: () => ({
    models: [{ id: 'model-a', apiModel: 'model-a', label: '模型 A' }],
  }),
  storyboardPickerFallbackAnchor: { left: 8, top: 8 },
  generateStoryboardGridImageDataUrl: (...args: unknown[]) =>
    mocks.generateGridImage(...args) as string,
  resolveStoryboardPointerAnchor: (...args: unknown[]) =>
    mocks.resolvePointerAnchor(...args) as { left: number; top: number },
  resolveStoryboardPickerAnchor: (...args: unknown[]) =>
    mocks.resolvePickerAnchor(...args) as { left: number; top: number },
});

vi.mock('@/shared/api/errors', () => ({
  backendErrorToastMessage: (...args: unknown[]) =>
    mocks.backendErrorToastMessage(...args),
}));

function data(
  patch: Partial<StoryboardGenNodeData> = {},
): StoryboardGenNodeData {
  return {
    displayName: '多版本宫格',
    gridRows: 1,
    gridCols: 1,
    frames: [{ id: 'frame-a', description: '主角 @图1', referenceIndex: 0 }],
    model: 'model-a',
    size: '1K',
    requestAspectRatio: '16:9',
    extraParams: { quality: 'high' },
    imageUrl: null,
    aspectRatio: '1:1',
    ...patch,
  };
}

describe('useStoryboardGenNodeController', () => {
  beforeEach(() => {
    mocks.zoom = 1;
    mocks.upstreamImages.splice(0);
    Object.assign(mocks.settings, {
      storyboardGenKeepStyleConsistent: true,
      storyboardGenDisableTextInImage: true,
      storyboardGenAutoInferEmptyFrame: true,
      ignoreAtTagWhenCopyingAndGenerating: true,
      enableStoryboardGenGridPreviewShortcut: false,
      showStoryboardGenAdvancedRatioControls: false,
    });
    mocks.setSelectedNode.mockReset();
    mocks.updateNodeData.mockReset();
    mocks.addNode.mockReset().mockReturnValue('result-a');
    mocks.addEdge.mockReset();
    mocks.findNodePosition.mockReset().mockReturnValue({ x: 100, y: 200 });
    mocks.updateNodeInternals.mockReset();
    mocks.detectAspectRatio.mockReset().mockResolvedValue('16:9');
    mocks.getRuntimeDiagnostics.mockReset().mockResolvedValue({
      appVersion: '1.0.0',
      osName: 'Windows',
      osVersion: '11',
      osBuild: '26100',
      userAgent: 'test',
    });
    mocks.showErrorDialog.mockReset();
    mocks.uploadLocalImageToBackend.mockReset().mockResolvedValue('/grid.png');
    mocks.submitGenerateImageJob.mockReset().mockResolvedValue({
      job_id: 'job-a',
      task_key: 'freezone_edit:job-a',
      task_type: 'freezone_edit',
    });
    mocks.generateGridImage.mockReset().mockReturnValue('data:image/png,grid');
    mocks.resolvePointerAnchor.mockReset().mockReturnValue({ left: 20, top: 30 });
    mocks.resolvePickerAnchor.mockReset().mockReturnValue({ left: 10, top: 15 });
    mocks.backendErrorToastMessage.mockReset().mockReturnValue('可读生成错误');
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it('projects layout and owns node, grid, ratio, and model-parameter writes', () => {
    const { result } = renderHook(() =>
      useStoryboardGenNodeController({
        id: 'storyboard-a',
        projectId: 'project-a',
        canvasId: 'canvas-a',
        data: data(),
        selected: true,
        width: 600.4,
        height: 550.4,
      }),
    );

    expect(result.current).toMatchObject({
      id: 'storyboard-a',
      selected: true,
      title: '多版本宫格',
      totalFrames: 1,
      layout: { size: { width: 600, height: 550 } },
    });
    expect(mocks.updateNodeInternals).toHaveBeenCalledWith('storyboard-a');

    act(() => result.current.select());
    act(() => result.current.rename('新宫格'));
    act(() => result.current.adjustRows(-1));
    act(() => result.current.adjustCols(2));
    act(() => result.current.setRatioControlMode('overall'));
    act(() => result.current.changeModel('model-b'));
    act(() => result.current.changeResolution('2K'));
    act(() => result.current.changeAspectRatio('1:1'));
    act(() => result.current.changeExtraParam('quality', 'low'));

    expect(mocks.setSelectedNode).toHaveBeenCalledWith('storyboard-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('storyboard-a', {
      displayName: '新宫格',
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('storyboard-a', {
      gridRows: 1,
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('storyboard-a', {
      gridCols: 3,
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('storyboard-a', {
      ratioControlMode: 'overall',
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('storyboard-a', {
      extraParams: { quality: 'low' },
    });
  });

  it('extends frame data and tracks reference tokens from upstream images', () => {
    mocks.upstreamImages.push('/first.png', '/second.png');
    const { result } = renderHook(() =>
      useStoryboardGenNodeController({
        id: 'storyboard-a',
        projectId: 'project-a',
        canvasId: 'canvas-a',
        data: data({ gridCols: 2 }),
      }),
    );

    const frameExpansion = mocks.updateNodeData.mock.calls.find(
      ([, patch]) => Array.isArray(patch.frames) && patch.frames.length === 2,
    );
    expect(frameExpansion?.[1].frames[0]).toMatchObject({ id: 'frame-a' });
    expect(frameExpansion?.[1].frames[1]).toMatchObject({
      description: '',
      referenceIndex: null,
    });

    act(() => result.current.changeFrameDescription(0, '参考 @图2'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('storyboard-a', {
      frames: [
        expect.objectContaining({
          id: 'frame-a',
          description: '参考 @图2',
          referenceIndex: 1,
        }),
      ],
    });

    const textarea = document.createElement('textarea');
    textarea.value = '参考';
    textarea.selectionStart = 2;
    act(() =>
      result.current.handleFrameKeyDown(0, {
        key: '@',
        currentTarget: textarea,
        preventDefault: vi.fn(),
      } as never),
    );
    expect(result.current.showImagePicker).toBe(true);
    expect(result.current.pickerAnchor).toEqual({ left: 10, top: 15 });
  });

  it('creates a local grid preview only when the shortcut is enabled', async () => {
    mocks.settings.enableStoryboardGenGridPreviewShortcut = true;
    const { result } = renderHook(() =>
      useStoryboardGenNodeController({
        id: 'storyboard-a',
        projectId: 'project-a',
        canvasId: 'canvas-a',
        data: data(),
      }),
    );

    await act(async () =>
      result.current.generateFromModifiers({
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
      }),
    );
    expect(mocks.generateGridImage).toHaveBeenCalledWith(
      '16:9',
      1,
      1,
      '1K',
    );
    expect(mocks.uploadLocalImageToBackend).toHaveBeenCalledWith(
      'project-a',
      'data:image/png,grid',
      expect.stringMatching(/^storyboard-grid-preview-storyboard-a-/),
    );
    expect(mocks.addNode).toHaveBeenCalledWith(
      'exportImageNode',
      { x: 100, y: 200 },
      expect.objectContaining({
        imageUrl: '/grid.png',
        previewImageUrl: '/grid.png',
        aspectRatio: '16:9',
        isGenerating: false,
      }),
    );
    expect(mocks.addEdge).toHaveBeenCalledWith('storyboard-a', 'result-a');
    expect(mocks.submitGenerateImageJob).not.toHaveBeenCalled();
  });

  it('creates a generating node and persists the submitted job contract', async () => {
    mocks.upstreamImages.push('/reference.png');
    const { result } = renderHook(() =>
      useStoryboardGenNodeController({
        id: 'storyboard-a',
        projectId: 'project-a',
        canvasId: 'canvas-a',
        data: data(),
      }),
    );

    await act(async () =>
      result.current.generateFromModifiers({
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      }),
    );
    expect(mocks.addNode).toHaveBeenCalledWith(
      'exportImageNode',
      { x: 100, y: 200 },
      expect.objectContaining({
        isGenerating: true,
        generationDurationMs: 45000,
        model: 'model-a',
        size: '1K',
        resultKind: 'storyboardGenOutput',
      }),
    );
    expect(mocks.submitGenerateImageJob).toHaveBeenCalledWith(
      { projectId: 'project-a', canvasId: 'canvas-a' },
      expect.objectContaining({
        model: 'request-model-a',
        aspectRatio: '16:9',
        referenceImages: ['/reference.png', '/grid.png'],
        nodeId: 'storyboard-a',
      }),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'result-a',
      expect.objectContaining({
        generationJobId: 'job-a',
        generationTaskJobId: 'job-a',
        generationTaskKey: 'freezone_edit:job-a',
        generationTaskType: 'freezone_edit',
        generationClientSessionId: 'session-a',
        generationStoryboardMetadata: {
          gridRows: 1,
          gridCols: 1,
          frameNotes: ['主角'],
        },
      }),
    );
  });

  it('keeps retry payload and diagnostics when job submission fails', async () => {
    mocks.submitGenerateImageJob.mockRejectedValueOnce(new Error('gateway'));
    const { result } = renderHook(() =>
      useStoryboardGenNodeController({
        id: 'storyboard-a',
        projectId: 'project-a',
        canvasId: 'canvas-a',
        data: data(),
      }),
    );

    await act(async () =>
      result.current.generateFromModifiers({
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      }),
    );
    expect(result.current.error).toBe('可读生成错误');
    expect(mocks.showErrorDialog).toHaveBeenCalledWith(
      '可读生成错误',
      'common.error',
      '诊断详情',
      '错误报告',
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'result-a',
      expect.objectContaining({
        isGenerating: false,
        generationStartedAt: null,
        generationJobId: null,
        generationError: '可读生成错误',
        generationErrorDetails: '诊断详情',
        generationErrorRequestId: 'request-a',
        generationRequestPayload: expect.objectContaining({
          model: 'request-model-a',
        }),
      }),
    );
  });

  it('clears the placeholder when reference-grid upload fails before submit', async () => {
    mocks.uploadLocalImageToBackend.mockRejectedValueOnce(
      new Error('upload failed'),
    );
    const { result } = renderHook(() =>
      useStoryboardGenNodeController({
        id: 'storyboard-a',
        projectId: 'project-a',
        canvasId: 'canvas-a',
        data: data(),
      }),
    );

    await act(async () =>
      result.current.generateFromModifiers({
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      }),
    );

    expect(mocks.submitGenerateImageJob).not.toHaveBeenCalled();
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'result-a',
      expect.objectContaining({
        generationError: '可读生成错误',
        generationJobId: null,
        generationStartedAt: null,
        isGenerating: false,
      }),
    );
  });
});
