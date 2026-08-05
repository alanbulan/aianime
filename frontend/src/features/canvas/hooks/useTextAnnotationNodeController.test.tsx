// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

;
import { TEXT_ANNOTATION_MUSIC_DEFAULT_CONTENT, type CanvasNode, type TextAnnotationNodeData } from '@/modules/creative_canvas/public';

import { useTextAnnotationNodeController } from './useTextAnnotationNodeController';

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
const mocks = vi.hoisted(() => ({
  nodes: [] as CanvasNode[],
  edges: [] as Array<{ id: string; source: string; target: string }>,
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  deleteEdge: vi.fn(),
  addNode: vi.fn(),
  addEdge: vi.fn(),
  duplicateNodeAsSibling: vi.fn(),
  findNodePosition: vi.fn(),
  autoGroupSpawn: vi.fn(),
  getNode: vi.fn(),
  getInternalNode: vi.fn(),
  setCenter: vi.fn(async () => undefined),
  boxSelecting: false,
  systemManaged: false,
  isGenerating: false,
  videoModels: [{ id: 'video-model-a' }],
  generateCanvasReversePrompt: vi.fn(),
  submitVideoGeneration: vi.fn(),
  awaitCanvasGenerationTaskCompletion: vi.fn(),
  translateCanvasText: vi.fn(),
  outputUrl: vi.fn(),
  translate: vi.fn((key: string) => key),
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    getNode: mocks.getNode,
    getInternalNode: mocks.getInternalNode,
    setCenter: mocks.setCenter,
  }),
  NodeToolbar: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.translate }),
}));


vi.mock('@/modules/creative_canvas/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/creative_canvas/public')>()),
  useCanvasStore: (() => {
  const state = () => ({
    nodes: mocks.nodes,
    edges: mocks.edges,
    setSelectedNode: mocks.setSelectedNode,
    updateNodeData: mocks.updateNodeData,
    deleteEdge: mocks.deleteEdge,
    addNode: mocks.addNode,
    addEdge: mocks.addEdge,
    duplicateNodeAsSibling: mocks.duplicateNodeAsSibling,
    findNodePosition: mocks.findNodePosition,
    autoGroupSpawn: mocks.autoGroupSpawn,
  });
  const useCanvasStore = Object.assign(
    (selector: (value: ReturnType<typeof state>) => unknown) =>
      selector(state()),
    { getState: state },
  );
  
  return useCanvasStore;
})(),
  DEFAULT_SHARED_MODEL_ID: '',
  DEFAULT_VIDEO_MODEL_ID: '',
  generationTaskDescriptor: (task: { task_key: string }) => ({
    generationTaskKey: task.task_key,
  }),
  generateCanvasReversePrompt: (
    command: unknown,
    onTaskSubmitted: (task: unknown) => void,
  ) => mocks.generateCanvasReversePrompt(command, onTaskSubmitted),
  translateCanvasText: (command: unknown) =>
    mocks.translateCanvasText(command),
  submitVideoGeneration: (command: unknown) =>
    mocks.submitVideoGeneration(command),
  resolveGenerationOutputUrl: (result: unknown, kind: string) =>
    mocks.outputUrl(result, kind),
  resolveImageDisplayUrl: (url: string) => `display:${url}`,
  useCanvasVideoModels: () => ({ models: mocks.videoModels }),
  isSystemManagedNodeData: () => mocks.systemManaged,
  useNodeGenerationTaskState: () => ({
    isGenerating: mocks.isGenerating,
  }),
}));

vi.mock('@/modules/model_usage/public', () => ({
  useGenerationCreditCost: () => ({
    data: { data: { display: '2 credits' } },
  }),
}));

const NODE_CONTEXT = {
  projectId: 'project-a',
  canvasId: 'canvas-a',
} as const;

vi.mock('@/modules/creative_canvas/canvasComposition', () => ({
  awaitCanvasGenerationTaskCompletion: (taskKey: string, project: string) =>
    mocks.awaitCanvasGenerationTaskCompletion(taskKey, project),
  useIsBoxSelecting: () => mocks.boxSelecting,
}));

function data(
  patch: Partial<TextAnnotationNodeData> = {},
): TextAnnotationNodeData {
  return {
    label: '文本节点',
    displayName: '文本节点',
    content: '原始正文',
    ...patch,
  };
}

function node({
  id,
  type,
  x = 0,
  y = 0,
  nodeData = {},
}: {
  id: string;
  type: CanvasNode['type'];
  x?: number;
  y?: number;
  nodeData?: Record<string, unknown>;
}): CanvasNode {
  return {
    id,
    type,
    position: { x, y },
    data: nodeData,
  } as CanvasNode;
}

describe('useTextAnnotationNodeController', () => {
  beforeEach(() => {
    mocks.nodes.splice(0);
    mocks.edges.splice(0);
    mocks.setSelectedNode.mockReset();
    mocks.updateNodeData.mockReset();
    mocks.deleteEdge.mockReset();
    mocks.addNode.mockReset().mockImplementation((type: string) =>
      type === CANVAS_NODE_TYPES.video
        ? 'video-created'
        : type === CANVAS_NODE_TYPES.upload
          ? 'upload-created'
          : 'audio-created',
    );
    mocks.addEdge.mockReset();
    mocks.duplicateNodeAsSibling.mockReset();
    mocks.findNodePosition.mockReset().mockReturnValue({ x: 700, y: 300 });
    mocks.autoGroupSpawn.mockReset();
    mocks.getNode.mockReset().mockReturnValue({
      position: { x: 10, y: 20 },
      measured: { width: 500, height: 300 },
    });
    mocks.getInternalNode.mockReset().mockReturnValue({
      internals: { positionAbsolute: { x: 100, y: 200 } },
    });
    mocks.setCenter.mockReset().mockResolvedValue(undefined);
    mocks.boxSelecting = false;
    mocks.systemManaged = false;
    mocks.isGenerating = false;
    mocks.videoModels = [{ id: 'video-model-a' }];
    mocks.generateCanvasReversePrompt.mockReset();
    mocks.submitVideoGeneration.mockReset();
    mocks.awaitCanvasGenerationTaskCompletion.mockReset();
    mocks.translateCanvasText.mockReset();
    mocks.outputUrl.mockReset();
    mocks.translate.mockClear();
  });

  it('projects node state and owns selection, editing, and upstream commands', () => {
    mocks.nodes.push(
      node({
        id: 'image-a',
        type: CANVAS_NODE_TYPES.upload,
        nodeData: { previewImageUrl: '/preview.webp' },
      }),
      node({
        id: 'text-a',
        type: CANVAS_NODE_TYPES.textAnnotation,
        x: 500,
        y: 60,
      }),
    );
    mocks.edges.push({
      id: 'edge-image',
      source: 'image-a',
      target: 'text-a',
    });
    const { result } = renderHook(() =>
      useTextAnnotationNodeController({
        ...NODE_CONTEXT,
        id: 'text-a',
        data: data({ mode: 'removed-mode' as never }),
        selected: true,
        width: 120,
        height: 80,
      }),
    );

    expect(result.current).toMatchObject({
      id: 'text-a',
      mode: 'writing',
      title: '文本节点',
      isCompactView: false,
      upstreamImageDisplayUrl: 'display:/preview.webp',
      hasUserContent: true,
      showWritingOpsPanel: true,
      size: { width: 380, height: 240, minWidth: 380, minHeight: 240 },
    });

    act(() => result.current.select());
    act(() => result.current.rename('新标题'));
    act(() => result.current.changeContent('新正文'));
    act(() => result.current.changeModel('model-b'));
    act(() => result.current.detachUpstreamImage());
    expect(mocks.setSelectedNode).toHaveBeenCalledWith('text-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('text-a', {
      displayName: '新标题',
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('text-a', {
      content: '新正文',
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('text-a', {
      model: 'model-b',
    });
    expect(mocks.deleteEdge).toHaveBeenCalledWith('edge-image');

    act(() => result.current.enterEditMode());
    expect(mocks.setCenter).toHaveBeenCalledWith(350, 350, {
      zoom: 1.4,
      duration: 280,
    });
    expect(result.current.isEditingContent).toBe(true);
    act(() => result.current.cancelEditing());
    expect(result.current.isEditingContent).toBe(false);
  });

  it('spawns video, image-only upload, speech, and music nodes by mode', () => {
    mocks.nodes.push(
      node({
        id: 'text-a',
        type: CANVAS_NODE_TYPES.textAnnotation,
        x: 500,
        y: 60,
      }),
    );
    const { result } = renderHook(() =>
      useTextAnnotationNodeController({
        ...NODE_CONTEXT,
        id: 'text-a',
        data: data({ content: '生成描述' }),
      }),
    );

    act(() => result.current.selectMode('textToVideo'));
    expect(mocks.addNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.video,
      { x: 700, y: 300 },
      { genMode: 'textToVideo', prompt: '生成描述' },
    );
    expect(mocks.addEdge).toHaveBeenCalledWith('text-a', 'video-created');
    expect(mocks.autoGroupSpawn).toHaveBeenCalledWith(
      'text-a',
      ['video-created'],
      { label: '文生视频组' },
    );

    act(() => result.current.selectMode('imageToPrompt'));
    expect(mocks.addNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.upload,
      { x: 120, y: 60 },
      { imageOnly: true },
    );
    expect(mocks.addEdge).toHaveBeenCalledWith('upload-created', 'text-a');
    expect(mocks.autoGroupSpawn).toHaveBeenCalledWith(
      'text-a',
      ['upload-created'],
      { label: '图片反推提示词组' },
    );

    act(() => result.current.selectMode('textToMusic'));
    expect(mocks.addNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.audio,
      { x: 700, y: 300 },
      { audioKind: 'speech' },
    );
    expect(mocks.autoGroupSpawn).toHaveBeenCalledWith(
      'text-a',
      ['audio-created'],
      { label: '克隆音频组' },
    );

    act(() => result.current.selectMode('textToMusicGen'));
    expect(mocks.addNode).toHaveBeenLastCalledWith(
      CANVAS_NODE_TYPES.audio,
      { x: 700, y: 300 },
      { audioKind: 'music' },
    );
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith('text-a', {
      mode: 'writing',
      pickerDismissed: true,
      content: TEXT_ANNOTATION_MUSIC_DEFAULT_CONTENT,
    });
    expect(mocks.autoGroupSpawn).toHaveBeenCalledWith(
      'text-a',
      ['audio-created'],
      { label: '文字生成音乐组' },
    );
  });

  it('runs reverse prompt generation and persists its recoverable task', async () => {
    mocks.nodes.push(
      node({
        id: 'image-a',
        type: CANVAS_NODE_TYPES.upload,
        nodeData: { referenceImageUrl: '/reference.jpg' },
      }),
      node({ id: 'text-a', type: CANVAS_NODE_TYPES.textAnnotation }),
    );
    mocks.edges.push({ id: 'edge-a', source: 'image-a', target: 'text-a' });
    mocks.generateCanvasReversePrompt.mockImplementation(
      async (
        _command: unknown,
        onTaskSubmitted: (task: { task_key: string }) => void,
      ) => {
        onTaskSubmitted({ task_key: 'reverse-task' });
        return {
          prompt: '结构化提示词',
          task: { job_id: 'reverse-job' },
        };
      },
    );
    const { result } = renderHook(() =>
      useTextAnnotationNodeController({
        ...NODE_CONTEXT,
        id: 'text-a',
        data: data({ mode: 'imageToPrompt' }),
      }),
    );

    act(() => result.current.submit());
    await waitFor(() => {
      expect(mocks.generateCanvasReversePrompt).toHaveBeenCalledOnce();
    });
    expect(mocks.generateCanvasReversePrompt).toHaveBeenCalledWith(
      {
        projectId: 'project-a',
        rawSourceUrl: '/reference.jpg',
        canvasId: 'canvas-a',
        nodeId: 'text-a',
      },
      expect.any(Function),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith('text-a', {
      generationTaskKey: 'reverse-task',
    });
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith('text-a', {
      content: '结构化提示词',
      isGenerating: false,
      generationStartedAt: null,
    });
  });

  it('submits one task per requested video and writes each completed output', async () => {
    mocks.nodes.push(
      node({ id: 'text-a', type: CANVAS_NODE_TYPES.textAnnotation }),
      node({
        id: 'video-a',
        type: CANVAS_NODE_TYPES.video,
        nodeData: {
          count: 2,
          aspectRatio: '9:16',
          quality: '1080P',
          durationSec: 8,
          generateAudio: true,
        },
      }),
    );
    mocks.edges.push({ id: 'edge-a', source: 'text-a', target: 'video-a' });
    mocks.duplicateNodeAsSibling.mockReturnValue('video-b');
    mocks.submitVideoGeneration.mockImplementation(
      async (command: { nodeId: string }) => ({
        task_key: `task-${command.nodeId}`,
      }),
    );
    mocks.awaitCanvasGenerationTaskCompletion.mockImplementation(
      async (taskKey: string) => ({ result: { url: `/${taskKey}.mp4` } }),
    );
    mocks.outputUrl.mockImplementation(
      (value: { url: string }) => value.url,
    );
    const { result } = renderHook(() =>
      useTextAnnotationNodeController({
        ...NODE_CONTEXT,
        id: 'text-a',
        data: data({ mode: 'textToVideo', content: '  视频提示词  ' }),
      }),
    );

    act(() => result.current.submit());
    await waitFor(() => {
      expect(mocks.submitVideoGeneration).toHaveBeenCalledTimes(2);
    });
    expect(mocks.duplicateNodeAsSibling).toHaveBeenCalledWith(
      'video-a',
      1,
      expect.objectContaining({ count: 1, generationBatch: null }),
    );
    expect(mocks.submitVideoGeneration).toHaveBeenCalledTimes(2);
    expect(mocks.submitVideoGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'video-a',
        prompt: '视频提示词',
        model: 'video-model-a',
        aspectRatio: '9:16',
        quality: '1080P',
        durationSeconds: 8,
        generateAudio: true,
      }),
    );
    expect(mocks.submitVideoGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'video-b' }),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'video-a',
      expect.objectContaining({ videoUrl: '/task-video-a.mp4' }),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'video-b',
      expect.objectContaining({ videoUrl: '/task-video-b.mp4' }),
    );
  });

  it('translates writing content through the canvas use case', async () => {
    mocks.translateCanvasText.mockResolvedValue({
      translatedText: 'Translated text',
    });
    const { result } = renderHook(() =>
      useTextAnnotationNodeController({
        ...NODE_CONTEXT,
        id: 'text-a',
        data: data({ mode: 'writing', content: '待翻译文本' }),
        selected: true,
      }),
    );

    expect(result.current.translateDisabled).toBe(false);
    await act(async () => result.current.translate());
    expect(mocks.translateCanvasText).toHaveBeenCalledWith({
      projectId: 'project-a',
      text: '待翻译文本',
      nodeType: 'text',
      canvasId: 'canvas-a',
      nodeId: 'text-a',
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('text-a', {
      content: 'Translated text',
    });
    expect(result.current.isTranslating).toBe(false);
  });
});
