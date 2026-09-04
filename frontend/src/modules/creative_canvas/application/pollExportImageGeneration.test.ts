// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from 'vitest';

import {
  pollExportImageGeneration,
  type PollExportImageGenerationDependencies,
  type PollExportImageGenerationParams,
} from './pollExportImageGeneration';

function createDependencies(
  overrides: Partial<PollExportImageGenerationDependencies> = {},
): PollExportImageGenerationDependencies {
  return {
    awaitGenerationTask: vi.fn().mockResolvedValue(
      'https://example.com/result.png',
    ),
    prepareNodeImage: vi.fn().mockResolvedValue({
      imageUrl: 'data:image/png;base64,prepared',
      aspectRatio: '16:9',
    }),
    embedStoryboardImageMetadata: vi.fn().mockResolvedValue(
      'data:image/png;base64,metadata',
    ),
    uploadLocalImage: vi.fn().mockResolvedValue(
      'https://example.com/storyboard.png',
    ),
    showErrorDialog: vi.fn(),
    now: vi.fn(() => 1234),
    warn: vi.fn(),
    ...overrides,
  };
}

function pendingGenerationData(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    isGenerating: true,
    generationJobId: 'job-1',
    generationTaskJobId: 'job-1',
    generationTaskKey: 'task-1',
    generationTaskType: 'freezone_edit',
    ...overrides,
  };
}

function createParams(
  nodeData: Record<string, unknown> | null,
) {
  return {
    nodeId: 'node-1',
    runtimeSessionId: 'runtime-1',
    errorTitle: 'Generation error',
    getNodeData: vi.fn(() => nodeData),
    updateNodeData: vi.fn<(
      nodeId: string,
      patch: Record<string, unknown>,
    ) => void>(),
  } satisfies PollExportImageGenerationParams;
}

describe('pollExportImageGeneration', () => {
  it('stops when the node is missing or no longer generating', async () => {
    const dependencies = createDependencies();
    const missing = createParams(null);
    await pollExportImageGeneration(missing, dependencies);

    const inactive = createParams({
      isGenerating: false,
      generationJobId: 'job-1',
    });
    await pollExportImageGeneration(inactive, dependencies);

    expect(dependencies.awaitGenerationTask).not.toHaveBeenCalled();
    expect(missing.updateNodeData).not.toHaveBeenCalled();
    expect(inactive.updateNodeData).not.toHaveBeenCalled();
  });

  it('awaits the persisted task contract and stores the canonical result URL', async () => {
    const awaitGenerationTask = vi.fn().mockResolvedValue(
      ' https://example.com/result.png ',
    );
    const dependencies = createDependencies({ awaitGenerationTask });
    const params = createParams(pendingGenerationData());

    await pollExportImageGeneration(params, dependencies);

    expect(awaitGenerationTask).toHaveBeenCalledWith(
      {
        job_id: 'job-1',
        task_key: 'task-1',
        task_type: 'freezone_edit',
      },
      { recoverExpiredTask: true },
    );
    expect(dependencies.prepareNodeImage).toHaveBeenCalledWith(
      'https://example.com/result.png',
    );
    expect(dependencies.embedStoryboardImageMetadata).not.toHaveBeenCalled();
    expect(dependencies.uploadLocalImage).not.toHaveBeenCalled();
    expect(params.updateNodeData).toHaveBeenCalledWith('node-1', {
      imageUrl: 'https://example.com/result.png',
      previewImageUrl: 'https://example.com/result.png',
      aspectRatio: '16:9',
      generationTaskJobId: null,
      generationTaskKey: null,
      generationTaskRefs: null,
      generationTaskType: null,
      isGenerating: false,
      generationStartedAt: null,
      generationJobId: null,
      generationProviderId: null,
      generationClientSessionId: null,
      generationStoryboardMetadata: undefined,
      generationError: null,
      generationErrorDetails: null,
      generationDebugContext: undefined,
    });
  });

  it('embeds storyboard metadata and uploads the processed image', async () => {
    const dependencies = createDependencies();
    const params = createParams(pendingGenerationData({
      generationStoryboardMetadata: {
        gridRows: 2.4,
        gridCols: 0,
        frameNotes: ['first'],
      },
    }));

    await pollExportImageGeneration(params, dependencies);

    expect(dependencies.embedStoryboardImageMetadata).toHaveBeenCalledWith(
      'data:image/png;base64,prepared',
      { gridRows: 2, gridCols: 1, frameNotes: ['first'] },
    );
    expect(dependencies.uploadLocalImage).toHaveBeenCalledWith(
      'data:image/png;base64,metadata',
      'storyboard-gen-node-1-1234.png',
    );
    expect(params.updateNodeData).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        imageUrl: 'https://example.com/storyboard.png',
        previewImageUrl: 'https://example.com/storyboard.png',
      }),
    );
  });

  it('leaves the node in a retryable error state when completed-result processing fails', async () => {
    const dependencies = createDependencies({
      prepareNodeImage: vi.fn().mockRejectedValue(new Error('image decode failed')),
    });
    const params = createParams(pendingGenerationData({
      generationClientSessionId: 'runtime-1',
    }));

    await pollExportImageGeneration(params, dependencies);

    expect(params.updateNodeData).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        generationError: '生成结果处理失败: image decode failed',
        generationJobId: null,
        isGenerating: false,
      }),
    );
    expect(dependencies.showErrorDialog).toHaveBeenCalledWith(
      '生成结果处理失败: image decode failed',
      'Generation error',
      'image decode failed',
      expect.stringContaining('# Generation Error Report'),
    );
  });

  it('does not apply a completed result when image preparation starts a newer job', async () => {
    let nodeData: Record<string, unknown> = pendingGenerationData();
    const prepareNodeImage = vi.fn().mockImplementation(async () => {
      nodeData = {
        isGenerating: true,
        generationJobId: 'job-2',
      };
      return {
        imageUrl: 'data:image/png;base64,prepared',
        aspectRatio: '16:9',
      };
    });
    const dependencies = createDependencies({ prepareNodeImage });
    const params = createParams(nodeData);
    vi.mocked(params.getNodeData).mockImplementation(() => nodeData);

    await pollExportImageGeneration(params, dependencies);

    expect(params.updateNodeData).not.toHaveBeenCalled();
    expect(dependencies.prepareNodeImage).toHaveBeenCalledOnce();
  });

  it('reports a terminal task failure for this session', async () => {
    const taskError = new Error('request_id=req-1; upstream failed');
    const awaitGenerationTask = vi.fn().mockRejectedValue(taskError);
    const dependencies = createDependencies({ awaitGenerationTask });
    const params = createParams(pendingGenerationData({
      generationClientSessionId: 'runtime-1',
      generationDebugContext: { sourceType: 'unknown' },
    }));

    await pollExportImageGeneration(params, dependencies);

    expect(awaitGenerationTask).toHaveBeenCalledWith(
      expect.any(Object),
      { recoverExpiredTask: false },
    );
    expect(dependencies.showErrorDialog).toHaveBeenCalledWith(
      'request_id=req-1; upstream failed',
      'Generation error',
      'request_id=req-1; upstream failed',
      expect.stringContaining('# Generation Error Report'),
    );
    expect(params.updateNodeData).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        isGenerating: false,
        generationJobId: null,
        generationError: 'request_id=req-1; upstream failed',
        generationErrorDetails: 'request_id=req-1; upstream failed',
        generationErrorRequestId: 'req-1',
      }),
    );
  });

  it('rejects a legacy job id without a matching persisted task contract', async () => {
    const dependencies = createDependencies();
    const params = createParams(pendingGenerationData({
      generationTaskJobId: 'different-job',
      generationClientSessionId: 'runtime-1',
    }));

    await pollExportImageGeneration(params, dependencies);

    expect(dependencies.awaitGenerationTask).not.toHaveBeenCalled();
    expect(params.updateNodeData).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({
        generationError: '生成任务信息不完整或任务标识不一致',
        generationJobId: null,
        isGenerating: false,
      }),
    );
  });
});
