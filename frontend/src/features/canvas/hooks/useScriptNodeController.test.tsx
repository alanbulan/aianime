// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
  type ScriptNodeData,
} from '@/features/canvas/domain/canvasNodes';

import { useScriptNodeController } from './useScriptNodeController';

const mocks = vi.hoisted(() => ({
  nodes: [] as CanvasNode[],
  edges: [] as CanvasEdge[],
  upstreamNodes: [] as CanvasNode[],
  selectedNodeId: null as string | null,
  isGenerating: false,
  historyRecords: [] as Array<{ id: string; result: unknown }>,
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  addNode: vi.fn(),
  addEdge: vi.fn(),
  autoGroupSpawn: vi.fn(),
  updateNodeInternals: vi.fn(),
  refreshHistory: vi.fn(async () => undefined),
  generateCanvasStoryScript: vi.fn(),
  translateCanvasText: vi.fn(),
  generationCreditCost: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
}));

vi.mock('@/features/canvas/canvasStore', () => {
  const state = () => ({
    nodes: mocks.nodes,
    edges: mocks.edges,
    selectedNodeId: mocks.selectedNodeId,
    setSelectedNode: mocks.setSelectedNode,
    updateNodeData: mocks.updateNodeData,
    addNode: mocks.addNode,
    addEdge: mocks.addEdge,
    autoGroupSpawn: mocks.autoGroupSpawn,
  });
  const useCanvasStore = Object.assign(
    (selector: (value: ReturnType<typeof state>) => unknown) =>
      selector(state()),
    { getState: state },
  );
  return { useCanvasStore };
});

vi.mock('@/features/canvas/composition', () => ({
  useUpstreamNodes: () => mocks.upstreamNodes,
}));

vi.mock('@/modules/model_usage/public', () => ({
  useGenerationCreditCost: (kind: string) => {
    mocks.generationCreditCost(kind);
    return { data: { data: { display: '3 credits' } } };
  },
}));

vi.mock('@/modules/creative_canvas/public', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/modules/creative_canvas/public')
  >();
  return {
    ...actual,
    useNodeGenerationHistory: () => ({
      records: mocks.historyRecords,
      isLoading: false,
      refresh: mocks.refreshHistory,
    }),
    useNodeGenerationTaskState: () => ({
      isGenerating: mocks.isGenerating,
    }),
    generateCanvasStoryScript: (
      command: unknown,
      onTaskSubmitted: (task: unknown) => void,
    ) => mocks.generateCanvasStoryScript(command, onTaskSubmitted),
    translateCanvasText: (command: unknown) =>
      mocks.translateCanvasText(command),
  };
});

const NODE_CONTEXT = {
  projectId: 'project-a',
  canvasId: 'canvas-a',
} as const;

function data(patch: Partial<ScriptNodeData> = {}): ScriptNodeData {
  return {
    label: '分镜脚本',
    displayName: '分镜脚本',
    ...patch,
  };
}

function node({
  id,
  type,
  x = 0,
  y = 0,
  height,
  nodeData = {},
}: {
  id: string;
  type: CanvasNode['type'];
  x?: number;
  y?: number;
  height?: number;
  nodeData?: Record<string, unknown>;
}): CanvasNode {
  return {
    id,
    type,
    position: { x, y },
    height,
    data: nodeData,
  } as CanvasNode;
}

describe('useScriptNodeController', () => {
  beforeEach(() => {
    mocks.nodes.splice(0);
    mocks.edges.splice(0);
    mocks.upstreamNodes.splice(0);
    mocks.historyRecords.splice(0);
    mocks.selectedNodeId = null;
    mocks.isGenerating = false;
    mocks.setSelectedNode.mockReset();
    mocks.updateNodeData.mockReset();
    let nextNode = 0;
    mocks.addNode.mockReset().mockImplementation(() => {
      nextNode += 1;
      return `created-${nextNode}`;
    });
    mocks.addEdge.mockReset();
    mocks.autoGroupSpawn.mockReset();
    mocks.updateNodeInternals.mockReset();
    mocks.refreshHistory.mockReset().mockResolvedValue(undefined);
    mocks.generateCanvasStoryScript.mockReset();
    mocks.translateCanvasText.mockReset();
    mocks.generationCreditCost.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('projects result state and owns selection, rename, and cell commits', () => {
    mocks.selectedNodeId = 'script-a';
    mocks.upstreamNodes.push(
      node({
        id: 'text-a',
        type: CANVAS_NODE_TYPES.textAnnotation,
        y: 20,
        nodeData: { content: '剧情内容' },
      }),
    );
    const { result } = renderHook(() =>
      useScriptNodeController({
        ...NODE_CONTEXT,
        id: 'script-a',
        data: data({
          scriptResult: {
            title: '第一集',
            rows: [{ shot_no: 1, dialogue: '原对白' }],
          },
        }),
        width: 700.4,
        height: 350.4,
      }),
    );

    expect(result.current).toMatchObject({
      selected: true,
      title: '分镜脚本',
      hasResult: true,
      headerSubtitle: '第一集',
      hasUpstream: true,
      size: { width: 700, height: 350 },
      showOperationsPanel: true,
      scriptCostDisplay: '3 credits',
    });
    expect(result.current.references[0].nodeId).toBe('text-a');
    expect(mocks.updateNodeInternals).toHaveBeenCalledWith('script-a');

    act(() => result.current.select());
    act(() => result.current.rename('新标题'));
    act(() => result.current.commitCell(0, 'dialogue', '新对白'));
    expect(mocks.setSelectedNode).toHaveBeenCalledWith('script-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('script-a', {
      displayName: '新标题',
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('script-a', {
      scriptResult: {
        title: '第一集',
        rows: [{ shot_no: 1, dialogue: '新对白' }],
      },
    });
  });

  it('creates and groups the selected upstream reference action', () => {
    mocks.nodes.push(
      node({
        id: 'script-a',
        type: CANVAS_NODE_TYPES.script,
        x: 1000,
        y: 200,
        height: 400,
      }),
    );
    const { result } = renderHook(() =>
      useScriptNodeController({
        ...NODE_CONTEXT,
        id: 'script-a',
        data: data(),
      }),
    );

    act(() => result.current.pickAction('fromScript'));
    expect(mocks.addNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.textAnnotation,
      { x: 520, y: 240 },
      { referenceOnly: true, displayName: '剧本' },
    );
    expect(mocks.addEdge).toHaveBeenCalledWith('created-1', 'script-a');
    expect(mocks.autoGroupSpawn).toHaveBeenCalledWith(
      'script-a',
      ['created-1'],
      { label: '剧本生成分镜脚本组' },
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith('script-a', {
      lastAction: 'fromScript',
    });
  });

  it('submits through the story-script use case and persists its task and result', async () => {
    mocks.generateCanvasStoryScript.mockImplementation(
      async (
        _command: unknown,
        onTaskSubmitted: (task: { task_key: string }) => void,
      ) => {
        onTaskSubmitted({ task_key: 'script-task' });
        return {
          scriptResult: {
            title: '生成标题',
            rows: [{ shot_no: 1, visual_description: '镜头' }],
          },
        };
      },
    );
    const { result } = renderHook(() =>
      useScriptNodeController({
        ...NODE_CONTEXT,
        id: 'script-a',
        data: data({ prompt: ' 生成一段剧情 ' }),
      }),
    );

    await act(async () => result.current.submit());
    expect(mocks.generateCanvasStoryScript).toHaveBeenCalledWith(
      {
        projectId: 'project-a',
        command: {
          sourceText: '生成一段剧情',
          canvasId: 'canvas-a',
          nodeId: 'script-a',
        },
      },
      expect.any(Function),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'script-a',
      expect.objectContaining({ generationTaskKey: 'script-task' }),
    );
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith('script-a', {
      isGenerating: false,
      generationStartedAt: null,
      scriptResult: {
        title: '生成标题',
        rows: [{ shot_no: 1, visual_description: '镜头' }],
      },
      scriptTitle: '生成标题',
      generationError: null,
    });
    expect(mocks.refreshHistory).toHaveBeenCalledOnce();
  });

  it('translates prompts and restores valid history records', async () => {
    mocks.translateCanvasText.mockResolvedValue({ translatedText: 'Translated' });
    const history = {
      id: 'history-a',
      result: { title: '历史标题', rows: [{ shot_no: 2 }] },
    };
    const { result } = renderHook(() =>
      useScriptNodeController({
        ...NODE_CONTEXT,
        id: 'script-a',
        data: data({ prompt: '待翻译' }),
        selected: true,
      }),
    );

    await act(async () => result.current.translate());
    expect(mocks.translateCanvasText).toHaveBeenCalledWith({
      projectId: 'project-a',
      text: '待翻译',
      nodeType: 'text',
      canvasId: 'canvas-a',
      nodeId: 'script-a',
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('script-a', {
      prompt: 'Translated',
    });

    act(() => result.current.restoreHistory(history as never));
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith('script-a', {
      scriptResult: history.result,
      scriptTitle: '历史标题',
      isGenerating: false,
      generationStartedAt: null,
    });
  });

  it('owns fullscreen, panel, reference-preview, and panel-unmount state', async () => {
    let selected = true;
    mocks.upstreamNodes.push(
      node({
        id: 'video-a',
        type: CANVAS_NODE_TYPES.video,
        nodeData: { videoUrl: '/video.mp4' },
      }),
    );
    const { result, rerender } = renderHook(() =>
      useScriptNodeController({
        ...NODE_CONTEXT,
        id: 'script-a',
        data: data({ prompt: '剧情' }),
        selected,
      }),
    );
    const reference = {
      nodeId: 'video-a',
      kind: 'video' as const,
      videoUrl: '/video.mp4',
    };

    act(() => result.current.openFullscreen());
    expect(result.current.isFullscreen).toBe(true);
    act(() => result.current.togglePanel());
    expect(result.current.panelExpanded).toBe(true);
    act(() =>
      result.current.showReferencePreview(reference, {
        left: 900,
        top: 500,
        width: 40,
      }),
    );
    expect(result.current.referencePreview).toMatchObject({
      reference,
      index: 0,
      top: 490,
      width: 240,
    });
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    await waitFor(() => expect(result.current.isFullscreen).toBe(false));
    mocks.upstreamNodes = [];
    rerender();
    await waitFor(() => expect(result.current.referencePreview).toBeNull());
    selected = false;
    rerender();
    await waitFor(() => {
      expect(result.current.panelExpanded).toBe(false);
      expect(result.current.referencePreview).toBeNull();
    });
    expect(mocks.generationCreditCost).toHaveBeenCalledWith('');
  });
});
