// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

;
import type { SkillDefinition, CanvasEdge, CanvasNode, SkillNodeData } from '@/modules/creative_canvas/public';
import { useSkillNodeController } from './useSkillNodeController';

const mocks = vi.hoisted(() => ({
  updateNodeInternals: vi.fn(),
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  addNode: vi.fn(),
  addEdgeWithData: vi.fn(),
  deleteNode: vi.fn(),
  publish: vi.fn(),
  startRun: vi.fn(),
  awaitRun: vi.fn(),
  awaitTask: vi.fn(),
  getSceneAssets: vi.fn(),
  getBeatManifest: vi.fn(),
  uploadAsset: vi.fn(),
  stageSelectedBackground: vi.fn(),
  nodes: [] as CanvasNode[],
  edges: [] as CanvasEdge[],
  skills: [] as SkillDefinition[],
  tasks: new Map(),
}));

const routeContext = {
  projectId: 'project-a',
  canvasId: 'canvas-a',
};

vi.mock('@xyflow/react', () => ({
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}));

vi.mock('zustand/react/shallow', () => ({
  useShallow: <T,>(selector: T) => selector,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      String(options?.defaultValue ?? key),
  }),
}));


vi.mock('@/features/canvas/composition', () => ({
  startCanvasSkillRun: (...args: unknown[]) => mocks.startRun(...args),
  awaitCanvasSkillRunResult: (...args: unknown[]) => mocks.awaitRun(...args),
  awaitCanvasGenerationTaskCompletion: (...args: unknown[]) =>
    mocks.awaitTask(...args),
  getCanvasSceneAssetsForBeat: (...args: unknown[]) =>
    mocks.getSceneAssets(...args),
  getCanvasBeatDirectorManifest: (...args: unknown[]) =>
    mocks.getBeatManifest(...args),
  uploadCanvasAsset: (...args: unknown[]) => mocks.uploadAsset(...args),
  stageSelectedBackgroundOutputForSkill: (...args: unknown[]) =>
    mocks.stageSelectedBackground(...args),
}));

vi.mock('@/modules/task_execution/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/task_execution/public')>()),
  useTaskCenterStore: (
    selector: (state: { tasks: Map<unknown, unknown>; isHydrated: boolean }) =>
      unknown,
  ) => selector({ tasks: mocks.tasks, isHydrated: true }),
}));

vi.mock('@/modules/creative_canvas/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/creative_canvas/public')>()),
  useCanvasStore: (() => {
    const updateNodeData = (id: string, patch: Record<string, unknown>) => {
      mocks.updateNodeData(id, patch);
      const node = mocks.nodes.find((item) => item.id === id);
      if (node) {
        node.data = { ...node.data, ...patch } as never;
      }
    };
    const state = () => ({
      nodes: mocks.nodes,
      edges: mocks.edges,
      setSelectedNode: mocks.setSelectedNode,
      updateNodeData,
      addNode: mocks.addNode,
      addEdgeWithData: mocks.addEdgeWithData,
      deleteNode: mocks.deleteNode,
    });
    const useCanvasStore = (
      selector: (value: ReturnType<typeof state>) => unknown,
    ) => selector(state());
    useCanvasStore.getState = state;

    return useCanvasStore;
  })(),
  loadCanvasSkillRegistry: vi.fn(),
  publishCanvasCommitRequested: (...args: unknown[]) => mocks.publish(...args),
  useCanvasSkillRegistry: () => ({
    skills: mocks.skills,
    isLoading: false,
    loadError: null,
  }),
}));

function skill(
  patch: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    id: 'tool.test',
    provider: 'tool',
    display_name: '测试技能',
    description: '测试说明',
    inputs: [],
    outputs: [
      {
        role: 'current_frame_candidate',
        label: '候选帧',
        media_type: 'image',
        node_type: 'imageGenNode',
        pushable: true,
      },
    ],
    parameters: {
      enabled: { type: 'boolean', label: '启用', default: false },
    },
    ...patch,
  };
}

function skillNode(data: SkillNodeData): CanvasNode {
  return {
    id: 'skill-a',
    type: 'skillNode',
    position: { x: 100, y: 200 },
    data,
  } as CanvasNode;
}

describe('useSkillNodeController', () => {
  beforeEach(() => {
    mocks.nodes.splice(0);
    mocks.edges.splice(0);
    mocks.skills.splice(0);
    mocks.tasks.clear();
    for (const mock of [
      mocks.updateNodeInternals,
      mocks.setSelectedNode,
      mocks.updateNodeData,
      mocks.addNode,
      mocks.addEdgeWithData,
      mocks.deleteNode,
      mocks.publish,
      mocks.startRun,
      mocks.awaitRun,
      mocks.awaitTask,
      mocks.getSceneAssets,
      mocks.getBeatManifest,
      mocks.uploadAsset,
      mocks.stageSelectedBackground,
    ]) {
      mock.mockReset();
    }
    mocks.addNode.mockReturnValue('output-a');
    mocks.addEdgeWithData.mockReturnValue('edge-output-a');
    mocks.startRun.mockResolvedValue({ run_id: 'run-a' });
    mocks.awaitRun.mockResolvedValue({
      status: 'completed',
      outputs: [
        {
          schema_version: 'skill.v1',
          role: 'current_frame_candidate',
          media_type: 'image',
          node_type: 'imageGenNode',
          pushable: true,
          image_url: '/result.png',
          label: '候选帧',
        },
      ],
    });
  });

  it('projects contextual handles and owns selection and parameter writes', () => {
    const definition = skill({
      id: 'freezone.frame_from_context',
      inputs: [
        {
          role: 'beat_context',
          label: '镜头上下文',
          accepts: {},
          required: true,
          cardinality: 'single',
        },
        {
          role: 'identity',
          label: '角色',
          accepts: {},
          required: false,
          cardinality: 'multi',
        },
      ],
    });
    mocks.skills.push(definition);
    const data: SkillNodeData = {
      skill_id: definition.id,
      parameters: { enabled: false },
    };
    const context = {
      id: 'context-a',
      type: 'beatContextNode',
      position: { x: 0, y: 0 },
      data: {
        episode: 1,
        beat: 2,
        content: '{{Alice}} enters',
        detectedIdentities: ['Alice'],
      },
    } as unknown as CanvasNode;
    mocks.nodes.push(skillNode(data), context);
    mocks.edges.push({
      id: 'context-edge',
      source: context.id,
      target: 'skill-a',
      targetHandle: 'beat_context',
    } as CanvasEdge);

    const { result } = renderHook(() =>
      useSkillNodeController({
        ...routeContext,
        id: 'skill-a',
        data,
        selected: true,
        width: 440,
      }),
    );

    expect(result.current.resolvedWidth).toBe(440);
    expect(result.current.beatTarget).toEqual({ episode: 1, beat: 2 });
    expect(result.current.inputHandleIds).toEqual([
      'beat_context',
      'identity:Alice',
    ]);
    expect(result.current.referenceInputHandlesByRole.identity).toEqual([
      'identity:Alice',
    ]);

    act(() => {
      result.current.selectNode();
      result.current.changeParameter('enabled', true);
    });

    expect(mocks.setSelectedNode).toHaveBeenCalledWith('skill-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('skill-a', {
      parameters: { enabled: true },
    });
    expect(mocks.updateNodeInternals).toHaveBeenCalledWith('skill-a');
  });

  it('submits one run and materializes its output beside the current node', async () => {
    const definition = skill();
    mocks.skills.push(definition);
    const data: SkillNodeData = {
      skill_id: definition.id,
      parameters: { enabled: true },
    };
    mocks.nodes.push(skillNode(data));

    const { result } = renderHook(() =>
      useSkillNodeController({ ...routeContext, id: 'skill-a', data }),
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(mocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-a',
        skillId: 'tool.test',
        request: expect.objectContaining({
          skill_node_id: 'skill-a',
          canvas_id: 'canvas-a',
          parameters: { enabled: true },
        }),
      }),
    );
    expect(mocks.awaitRun).toHaveBeenCalledWith({
      projectId: 'project-a',
      runId: 'run-a',
    });
    expect(mocks.addNode).toHaveBeenCalledWith(
      'imageGenNode',
      { x: 560, y: 200 },
      expect.objectContaining({
        imageUrl: '/result.png',
        candidate_origin: {
          skill_id: 'tool.test',
          skill_node_id: 'skill-a',
        },
      }),
    );
    expect(mocks.addEdgeWithData).toHaveBeenCalledWith(
      'skill-a',
      'output-a',
      expect.objectContaining({ role: 'current_frame_candidate' }),
      expect.objectContaining({
        sourceHandle: 'current_frame_candidate',
        targetHandle: 'target',
      }),
    );
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith(
      'skill-a',
      expect.objectContaining({
        isGenerating: false,
        generationError: null,
      }),
    );
  });

  it('rejects a completion after the route switches to another canvas', async () => {
    const definition = skill();
    mocks.skills.push(definition);
    const data: SkillNodeData = {
      skill_id: definition.id,
      parameters: { enabled: true },
    };
    mocks.nodes.push(skillNode(data));
    let releaseRun!: () => void;
    mocks.awaitRun.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseRun = resolve;
      });
      return {
        status: 'completed',
        outputs: [
          {
            schema_version: 'skill.v1',
            role: 'current_frame_candidate',
            media_type: 'image',
            node_type: 'imageGenNode',
            pushable: true,
            image_url: '/stale-result.png',
          },
        ],
      };
    });
    const { result, rerender } = renderHook(
      ({ projectId, canvasId }) =>
        useSkillNodeController({
          id: 'skill-a',
          data,
          projectId,
          canvasId,
        }),
      { initialProps: routeContext },
    );
    let submitPromise!: Promise<void>;

    act(() => {
      submitPromise = result.current.submit();
    });
    await waitFor(() => expect(mocks.awaitRun).toHaveBeenCalledOnce());
    rerender({ projectId: 'project-b', canvasId: 'canvas-b' });
    await act(async () => {
      releaseRun();
      await submitPromise;
    });

    expect(mocks.addNode).not.toHaveBeenCalled();
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith(
      'skill-a',
      expect.objectContaining({
        isGenerating: false,
        generationError:
          'Skill run completed after switching canvas; output was not materialized',
      }),
    );
  });
});
