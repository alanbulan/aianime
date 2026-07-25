// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from 'vitest';

import {
  EXPORT_IMAGE_GENERATION_POLL_INTERVAL_MS,
  pollExportImageGeneration,
  type PollExportImageGenerationDependencies,
  type PollExportImageGenerationParams,
} from './pollExportImageGeneration';

function createDependencies(
  overrides: Partial<PollExportImageGenerationDependencies> = {},
): PollExportImageGenerationDependencies {
  return {
    getGenerateImageJob: vi.fn().mockResolvedValue({
      job_id: 'job-1',
      status: 'succeeded',
      result: 'https://example.com/result.png',
    }),
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
    sleep: vi.fn().mockResolvedValue(undefined),
    now: vi.fn(() => 1234),
    warn: vi.fn(),
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

    expect(dependencies.getGenerateImageJob).not.toHaveBeenCalled();
    expect(missing.updateNodeData).not.toHaveBeenCalled();
    expect(inactive.updateNodeData).not.toHaveBeenCalled();
  });

  it('waits for a queued job and stores the canonical result URL', async () => {
    const getGenerateImageJob = vi.fn()
      .mockResolvedValueOnce({ job_id: 'job-1', status: 'queued' })
      .mockResolvedValueOnce({
        job_id: 'job-1',
        status: 'succeeded',
        result: ' https://example.com/result.png ',
      });
    const dependencies = createDependencies({ getGenerateImageJob });
    const params = createParams({
      isGenerating: true,
      generationJobId: 'job-1',
    });

    await pollExportImageGeneration(params, dependencies);

    expect(dependencies.sleep).toHaveBeenCalledWith(
      EXPORT_IMAGE_GENERATION_POLL_INTERVAL_MS,
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
    const params = createParams({
      isGenerating: true,
      generationJobId: 'job-1',
      generationStoryboardMetadata: {
        gridRows: 2.4,
        gridCols: 0,
        frameNotes: ['first'],
      },
    });

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

  it('retries polling errors and reports a terminal failure for this session', async () => {
    const pollError = new Error('network unavailable');
    const getGenerateImageJob = vi.fn()
      .mockRejectedValueOnce(pollError)
      .mockResolvedValueOnce({
        job_id: 'job-1',
        status: 'failed',
        error: 'request_id=req-1; upstream failed',
      });
    const dependencies = createDependencies({ getGenerateImageJob });
    const params = createParams({
      isGenerating: true,
      generationJobId: 'job-1',
      generationClientSessionId: 'runtime-1',
      generationDebugContext: { sourceType: 'unknown' },
    });

    await pollExportImageGeneration(params, dependencies);

    expect(dependencies.warn).toHaveBeenCalledWith(
      '[GenerationJob] poll failed',
      { nodeId: 'node-1', jobId: 'job-1', error: pollError },
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
});
