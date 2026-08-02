// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeType,
} from '@/features/canvas/domain/canvasNodes';
import { useCanvasStore } from '@/features/canvas/canvasStore';

import { useCanvasGenerationRecoveryController } from './useCanvasGenerationRecoveryController';

const generationMocks = vi.hoisted(() => ({
  pollExportImageGeneration: vi.fn(),
  resumeNodeGeneration: vi.fn(),
}));

vi.mock('@/features/canvas/composition', () => generationMocks);

function generationNode(
  id: string,
  type: CanvasNodeType,
  data: Record<string, unknown>,
): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  } as CanvasNode;
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('useCanvasGenerationRecoveryController', () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
    generationMocks.pollExportImageGeneration.mockReset().mockResolvedValue(undefined);
    generationMocks.resumeNodeGeneration.mockReset().mockResolvedValue(undefined);
  });

  it('polls export jobs and resumes persisted generation tasks through composition', () => {
    const exportNode = generationNode(
      'export-node',
      CANVAS_NODE_TYPES.exportImage,
      {
        aspectRatio: '1:1',
        generationJobId: 'job-1',
        imageUrl: null,
        isGenerating: true,
      },
    );
    const resumeNode = generationNode(
      'resume-node',
      CANVAS_NODE_TYPES.imageGen,
      {
        generationTaskJobId: 'job-2',
        generationTaskKey: 'controller-resume-task-1',
        generationTaskType: 'freezone_gen',
        isGenerating: true,
      },
    );
    useCanvasStore.getState().setCanvasData([exportNode, resumeNode], []);
    const currentExportNode = useCanvasStore
      .getState()
      .nodes
      .find((node) => node.id === 'export-node');
    const currentResumeNode = useCanvasStore
      .getState()
      .nodes
      .find((node) => node.id === 'resume-node');

    renderHook(() =>
      useCanvasGenerationRecoveryController({
        projectId: 'project-1',
        errorTitle: '生成失败',
      }),
    );

    expect(generationMocks.pollExportImageGeneration).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        nodeId: 'export-node',
        errorTitle: '生成失败',
        updateNodeData: useCanvasStore.getState().updateNodeData,
      }),
    );
    const pollParams = generationMocks.pollExportImageGeneration.mock.calls[0]?.[1];
    expect(pollParams?.getNodeData('export-node')).toBe(currentExportNode?.data);
    expect(generationMocks.resumeNodeGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        node: currentResumeNode,
        projectId: 'project-1',
        updateNodeData: useCanvasStore.getState().updateNodeData,
      }),
    );
    const resumeParams = generationMocks.resumeNodeGeneration.mock.calls[0]?.[0];
    expect(resumeParams?.getNodeData('resume-node')).toBe(currentResumeNode?.data);
  });

  it('does not poll or resume tasks without an explicit project', () => {
    useCanvasStore.getState().setCanvasData([
      generationNode('export-node', CANVAS_NODE_TYPES.exportImage, {
        generationJobId: 'job-1',
        isGenerating: true,
      }),
      generationNode('resume-node', CANVAS_NODE_TYPES.video, {
        generationTaskKey: 'controller-resume-task-2',
        isGenerating: true,
      }),
    ], []);

    renderHook(() =>
      useCanvasGenerationRecoveryController({
        projectId: null,
        errorTitle: '生成失败',
      }),
    );

    expect(generationMocks.pollExportImageGeneration).not.toHaveBeenCalled();
    expect(generationMocks.resumeNodeGeneration).not.toHaveBeenCalled();
  });

  it('does not restart a settled job when unrelated node fields change', async () => {
    const pollRun = deferred();
    generationMocks.pollExportImageGeneration.mockReturnValue(pollRun.promise);
    const exportNode = generationNode('export-node', CANVAS_NODE_TYPES.exportImage, {
      generationJobId: 'job-1',
      isGenerating: true,
    });
    useCanvasStore.getState().setCanvasData([exportNode], []);
    renderHook(() =>
      useCanvasGenerationRecoveryController({
        projectId: 'project-1',
        errorTitle: '生成失败',
      }),
    );

    await act(async () => pollRun.resolve());
    act(() => {
      useCanvasStore.setState({
        nodes: [{ ...exportNode, position: { x: 40, y: 20 } }],
      });
    });

    expect(generationMocks.pollExportImageGeneration).toHaveBeenCalledOnce();
  });
});
