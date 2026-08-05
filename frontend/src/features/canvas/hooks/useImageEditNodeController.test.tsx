// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

;
import { useImageEditNodeController } from './useImageEditNodeController';

import type { ImageEditNodeData } from "@/modules/creative_canvas/public";
const mocks = vi.hoisted(() => ({
  upstreamImages: [] as string[],
  upstreamContents: [] as Array<{
    nodeId: string;
    nodeType: string;
    displayName?: string;
    text?: string;
    imageUrl?: string;
    videoUrl?: string;
  }>,
  upstreamText: '',
  upstreamReferenceUrls: [] as string[],
  settings: {
    showNodePrice: false,
    priceDisplayCurrencyMode: 'credits',
    usdToCnyRate: 7.2,
    preferDiscountedPrice: true,
    grsaiCreditTierId: null as string | null,
  },
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  addNode: vi.fn(),
  addEdge: vi.fn(),
  findNodePosition: vi.fn(),
  autoGroupSpawn: vi.fn(),
  updateNodeInternals: vi.fn(),
  detachUpstream: vi.fn(),
  detectAspectRatio: vi.fn(),
  getRuntimeDiagnostics: vi.fn(),
  showErrorDialog: vi.fn(),
  submitGenerateImageJob: vi.fn(),
  resolvePickerAnchor: vi.fn(),
  backendErrorToastMessage: vi.fn(),
  useCanvasImageModels: vi.fn(),
  storeNodes: [] as Array<{
    id: string;
    position: { x: number; y: number };
    height?: number;
    data?: unknown;
  }>,
  storeEdges: [] as Array<{ source: string; target: string }>,
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
    ],
    resolutions: [{ value: '1K', label: '1K' }],
    resolveRequest: () => ({
      requestModel: 'request-model-a',
      modeLabel: 'A',
    }),
  },
  capability: {
    id: 'portrait-repair',
    name: '肖像修复',
    shortName: '修复',
    category: 'character',
    description: '',
    outputKind: 'identity_portrait',
    model: 'model-a',
    aspectRatio: '1:1',
    imageSize: '1K',
    inputs: [],
    params: [
      { key: 'strength', label: '强度', type: 'slider', defaultValue: 50 },
    ],
    compose: vi.fn(),
  },
}));

vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top' },
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, options?: Record<string, unknown>) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));


vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (
    selector: (value: typeof mocks.settings) => unknown,
  ) => selector(mocks.settings),
}));

vi.mock('@/modules/creative_canvas/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/creative_canvas/public')>()),
  useCanvasStore: (() => {
  const state = () => ({
    nodes: mocks.storeNodes,
    edges: mocks.storeEdges,
    setSelectedNode: mocks.setSelectedNode,
    updateNodeData: mocks.updateNodeData,
    addNode: mocks.addNode,
    addEdge: mocks.addEdge,
    findNodePosition: mocks.findNodePosition,
    autoGroupSpawn: mocks.autoGroupSpawn,
  });
  const useCanvasStore = (
    selector: (value: ReturnType<typeof state>) => unknown,
  ) => selector(state());
  useCanvasStore.getState = state;

  return useCanvasStore;
})(),
  IMAGE_EDIT_PICKER_FALLBACK_ANCHOR: { left: 8, top: 8 },
  buildGenerationErrorReport: () => '错误报告',
  collectUpstreamReferenceUrls: () => mocks.upstreamReferenceUrls,
  coercePushTarget: (value: unknown) =>
    value && typeof value === 'object' && 'kind' in value ? value : null,
  createReferenceImagePlaceholders: (count: number) =>
    Array.from({ length: count }, (_, index) => `image-${index + 1}`),
  defaultCapabilityParams: () => ({ strength: 50 }),
  getCapability: (id: string | undefined) =>
    id === mocks.capability.id ? mocks.capability : null,
  imageModelDefinitions: () => [mocks.imageModel],
  joinUpstreamText: () => mocks.upstreamText,
  listCapabilities: () => [mocks.capability],
  resolveImageModelResolution: () => mocks.imageModel.resolutions[0],
  resolveImageModelResolutions: () => mocks.imageModel.resolutions,
  resolveModelPriceDisplay: () => null,
  selectImageModel: () => mocks.imageModel,
  resolveErrorContent: () => ({ message: '生成失败', details: '诊断详情' }),
  resolveGenerationErrorDiagnostics: () => ({
    details: '诊断详情',
    requestId: 'request-a',
  }),
  resolveImageEditPickerAnchor: (...args: unknown[]) =>
    mocks.resolvePickerAnchor(...args),
  useCanvasImageModels: (...args: unknown[]) =>
    mocks.useCanvasImageModels(...args),
  useReferenceMentionSync: () => undefined,
}));

vi.mock('@/modules/creative_canvas/canvasComposition', () => ({
  CURRENT_RUNTIME_SESSION_ID: 'session-a',
  canvasAiGateway: {
    submitGenerateImageJob: (...args: unknown[]) =>
      mocks.submitGenerateImageJob(...args),
  },
  detectAspectRatio: (...args: unknown[]) => mocks.detectAspectRatio(...args),
  getRuntimeDiagnostics: () => mocks.getRuntimeDiagnostics(),
  showErrorDialog: (...args: unknown[]) => mocks.showErrorDialog(...args),
  useDetachUpstream: () => mocks.detachUpstream,
  useUpstreamContents: () => mocks.upstreamContents,
  useUpstreamImages: () => mocks.upstreamImages,
}));

vi.mock('@/shared/api/errors', () => ({
  backendErrorToastMessage: (...args: unknown[]) =>
    mocks.backendErrorToastMessage(...args),
}));

function data(patch: Partial<ImageEditNodeData> = {}): ImageEditNodeData {
  return {
    prompt: '增强主体',
    model: 'model-a',
    size: '1K',
    requestAspectRatio: '1:1',
    extraParams: { quality: 'high' },
    imageUrl: null,
    aspectRatio: '1:1',
    ...patch,
  };
}

describe('useImageEditNodeController', () => {
  beforeEach(() => {
    mocks.upstreamImages.splice(0);
    mocks.upstreamContents.splice(0);
    mocks.upstreamText = '';
    mocks.upstreamReferenceUrls.splice(0);
    mocks.storeNodes.splice(0);
    mocks.storeEdges.splice(0);
    mocks.setSelectedNode.mockReset();
    mocks.updateNodeData.mockReset();
    mocks.addNode.mockReset().mockReturnValue('result-a');
    mocks.addEdge.mockReset();
    mocks.findNodePosition.mockReset().mockReturnValue({ x: 100, y: 200 });
    mocks.autoGroupSpawn.mockReset();
    mocks.updateNodeInternals.mockReset();
    mocks.detachUpstream.mockReset();
    mocks.detectAspectRatio.mockReset().mockResolvedValue('16:9');
    mocks.getRuntimeDiagnostics.mockReset().mockResolvedValue({
      appVersion: '1.0.0',
      osName: 'Windows',
      osVersion: '11',
      osBuild: '26100',
      userAgent: 'test',
    });
    mocks.showErrorDialog.mockReset();
    mocks.submitGenerateImageJob.mockReset().mockResolvedValue('job-a');
    mocks.resolvePickerAnchor.mockReset().mockReturnValue({ left: 12, top: 24 });
    mocks.backendErrorToastMessage.mockReset().mockReturnValue('可读生成错误');
    mocks.useCanvasImageModels
      .mockReset()
      .mockReturnValue({ models: [{ id: 'model-a' }] });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it('projects references and owns node, mode, capability, and parameter writes', () => {
    mocks.upstreamImages.push('/reference.png');
    mocks.upstreamContents.push({
      nodeId: 'source-a',
      nodeType: 'upload',
      text: '上游文本',
      imageUrl: '/reference.png',
    });
    const { result } = renderHook(() =>
      useImageEditNodeController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        id: 'edit-a',
        data: data(),
        selected: true,
        width: 400,
        height: 500,
      }),
    );
    mocks.updateNodeData.mockClear();

    act(() => {
      result.current.select();
      result.current.rename('新标题');
      result.current.selectGenerationMode('image_reference');
      result.current.selectCapability(mocks.capability as never);
      result.current.updateCapabilityParam('strength', 80);
      result.current.changeExtraParam('quality', 'low');
    });

    expect(result.current.size).toEqual({ width: 520, height: 500 });
    expect(result.current.assetLibraryProject).toBe('project-a');
    expect(mocks.useCanvasImageModels).toHaveBeenCalledWith(
      'project-a',
      'edit',
    );
    expect(result.current.incomingImageItems[0]).toMatchObject({
      displayUrl: '/reference.png',
      sourceNodeId: 'source-a',
      label: '图1',
    });
    expect(result.current.generationMode).toBe('all_reference');
    expect(mocks.setSelectedNode).toHaveBeenCalledWith('edit-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('edit-a', {
      displayName: '新标题',
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'edit-a',
      expect.objectContaining({
        capabilityId: 'portrait-repair',
        generationMode: 'image_reference',
      }),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith('edit-a', {
      capabilityParams: { strength: 80 },
    });
  });

  it('owns reference insertion, replacement picker anchoring, and prompt writes', () => {
    mocks.upstreamImages.push('/reference.png');
    const { result } = renderHook(() =>
      useImageEditNodeController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        id: 'edit-a',
        data: data(),
      }),
    );
    mocks.updateNodeData.mockClear();

    act(() => result.current.insertImageReference(0));
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'edit-a',
      expect.objectContaining({ prompt: expect.stringContaining('@图1') }),
    );

    const textarea = document.createElement('textarea');
    textarea.value = '增强主体';
    textarea.selectionStart = 2;
    const preventDefault = vi.fn();
    act(() =>
      result.current.handlePromptKeyDown({
        key: '@',
        currentTarget: textarea,
        preventDefault,
        ctrlKey: false,
        metaKey: false,
      } as never),
    );
    expect(preventDefault).toHaveBeenCalled();
    expect(mocks.resolvePickerAnchor).toHaveBeenCalledWith(
      null,
      textarea,
      2,
    );
    expect(result.current.showImagePicker).toBe(true);
  });

  it('submits a deduplicated generation payload and persists the job handle', async () => {
    mocks.upstreamImages.push('/reference.png');
    mocks.upstreamReferenceUrls.push('/reference.png', '/video.mp4');
    mocks.upstreamText = '上游脚本';
    mocks.storeNodes.push({
      id: 'source-a',
      position: { x: 0, y: 0 },
      data: { __freezone_source: { kind: 'identity', label: '角色甲' } },
    });
    mocks.storeEdges.push({ source: 'source-a', target: 'edit-a' });
    const { result } = renderHook(() =>
      useImageEditNodeController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        id: 'edit-a',
        data: data({ requestAspectRatio: 'auto' }),
      }),
    );

    await act(async () => result.current.generate());

    expect(mocks.addNode).toHaveBeenCalledWith(
      'exportImageNode',
      { x: 100, y: 200 },
      expect.objectContaining({
        isGenerating: true,
        __freezone_source: expect.objectContaining({
          kind: 'identity',
          role: 'candidate',
        }),
      }),
    );
    expect(mocks.addEdge).toHaveBeenCalledWith('edit-a', 'result-a');
    expect(mocks.submitGenerateImageJob).toHaveBeenCalledWith(
      { projectId: 'project-a', canvasId: 'canvas-a' },
      expect.objectContaining({
        prompt: '上游脚本\n\n增强主体',
        aspectRatio: '16:9',
        referenceImages: ['/reference.png', '/video.mp4'],
      }),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'result-a',
      expect.objectContaining({
        generationJobId: 'job-a',
        generationClientSessionId: 'session-a',
        generationRequestPayload: expect.any(Object),
      }),
    );
  });

  it('keeps the retry payload and diagnostics when submission fails', async () => {
    mocks.submitGenerateImageJob.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() =>
      useImageEditNodeController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        id: 'edit-a',
        data: data(),
      }),
    );

    await act(async () => result.current.generate());

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
        generationRequestPayload: expect.any(Object),
        generationErrorRequestId: 'request-a',
      }),
    );
  });

  it('spawns only image assets upstream and groups the created nodes', () => {
    mocks.storeNodes.push({
      id: 'edit-a',
      position: { x: 1000, y: 200 },
      height: 600,
    });
    mocks.addNode
      .mockReturnValueOnce('upload-a')
      .mockReturnValueOnce('upload-b');
    const { result } = renderHook(() =>
      useImageEditNodeController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        id: 'edit-a',
        data: data(),
      }),
    );

    act(() =>
      result.current.confirmAssetLibrarySelections([
        { media: 'image', url: '/a.png', name: 'A' },
        { media: 'video', url: '/skip.mp4', name: 'skip' },
        { media: 'image', url: '/b.png', name: 'B' },
      ]),
    );

    expect(mocks.addNode).toHaveBeenCalledTimes(2);
    expect(mocks.addEdge).toHaveBeenNthCalledWith(1, 'upload-a', 'edit-a');
    expect(mocks.addEdge).toHaveBeenNthCalledWith(2, 'upload-b', 'edit-a');
    expect(mocks.autoGroupSpawn).toHaveBeenCalledWith(
      'edit-a',
      ['upload-a', 'upload-b'],
      { label: '资产参考组' },
    );
  });
});
