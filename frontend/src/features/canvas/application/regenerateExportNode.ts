// Copyright (c) 2026 AI anime
import { resolveErrorContent } from './errorDialog';
import { CURRENT_RUNTIME_SESSION_ID, extractRequestId } from './generationErrorReport';
import type {
  AiGateway,
  CanvasRedrawTaskGateway,
  GenerateImagePayload,
} from './ports';
import { generationTaskDescriptor } from './resumeGeneration';

/**
 * Params persisted on an export node created by the 擦除 / 重绘 flow, so a failed
 * node can re-run its freezone `redraw` call without the overlay being mounted.
 */
interface FreezoneRedrawRequest {
  sourceUrl: string;
  maskUrl: string;
  aspectRatio: string;
  imageSize: string;
}

export interface RegenerateExportImageNodeParams {
  nodeId: string;
  nodeData: Record<string, unknown>;
  projectId: string | null | undefined;
  updateNodeData: (
    nodeId: string,
    patch: Record<string, unknown>,
  ) => void;
}

function readFreezoneRedrawRequest(
  data: Record<string, unknown>,
): FreezoneRedrawRequest | undefined {
  const req = data.freezoneRedrawRequest as Partial<FreezoneRedrawRequest> | undefined;
  if (!req || typeof req.sourceUrl !== 'string' || typeof req.maskUrl !== 'string') {
    return undefined;
  }
  return {
    sourceUrl: req.sourceUrl,
    maskUrl: req.maskUrl,
    aspectRatio: typeof req.aspectRatio === 'string' ? req.aspectRatio : 'original',
    imageSize: typeof req.imageSize === 'string' ? req.imageSize : '2K',
  };
}

/** Retry a failed 擦除/重绘 export node by re-running its stored freezone redraw. */
async function regenerateFreezoneRedrawNode(
  params: RegenerateExportImageNodeParams,
  request: FreezoneRedrawRequest,
  redrawGateway: CanvasRedrawTaskGateway,
): Promise<void> {
  const { nodeId, projectId, updateNodeData } = params;
  if (!projectId) {
    updateNodeData(nodeId, { generationError: '当前 URL 没有 project，无法重试' });
    return;
  }

  updateNodeData(nodeId, {
    isGenerating: true,
    generationStartedAt: Date.now(),
    generationError: null,
  });

  try {
    const ref = await redrawGateway.submit(projectId, {
      sourceUrl: request.sourceUrl,
      maskUrl: request.maskUrl,
      aspectRatio: request.aspectRatio,
      imageSize: request.imageSize,
    });
    updateNodeData(nodeId, generationTaskDescriptor(ref));
    const completed = await redrawGateway.awaitCompletion(
      ref.task_key,
      projectId,
    );
    const directUrl = completed.result?.['output_url'] as string | undefined;
    let url = directUrl;
    if (!url) {
      url = await redrawGateway.fetchResultUrl(
        projectId,
        ref.task_type,
        ref.job_id,
      );
    }
    updateNodeData(nodeId, {
      imageUrl: url,
      previewImageUrl: url,
      isGenerating: false,
      generationStartedAt: null,
      generationError: null,
      generationTaskKey: null,
      generationTaskType: null,
      generationTaskJobId: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[regenerate] freezone redraw failed', error);
    updateNodeData(nodeId, {
      isGenerating: false,
      generationStartedAt: null,
      generationError: message,
      generationTaskKey: null,
      generationTaskType: null,
      generationTaskJobId: null,
    });
  }
}

/**
 * Re-submit the generation that produced an export-result node, after it failed.
 *
 * Export nodes don't run their own submit loop — their parent (ImageEdit /
 * StoryboardGen) submits a job and stores the jobId, then Canvas.tsx polls it.
 * To retry without the parent being mounted/selected we persist the original
 * `generationRequestPayload` on the node at creation; here we re-submit it and
 * re-arm `generationJobId` so the existing Canvas polling effect picks it up.
 */
export async function regenerateExportImageNode(
  params: RegenerateExportImageNodeParams,
  aiGateway: AiGateway,
  redrawGateway: CanvasRedrawTaskGateway,
): Promise<void> {
  const { nodeData, nodeId, updateNodeData } = params;
  if (nodeData.isGenerating === true) {
    return;
  }

  const freezoneRequest = readFreezoneRedrawRequest(nodeData);
  if (freezoneRequest) {
    await regenerateFreezoneRedrawNode(
      params,
      freezoneRequest,
      redrawGateway,
    );
    return;
  }

  const payload = nodeData.generationRequestPayload as GenerateImagePayload | undefined;
  if (!payload) {
    console.warn('[regenerate] export node has no stored payload, cannot retry', nodeId);
    return;
  }

  updateNodeData(nodeId, {
    isGenerating: true,
    generationStartedAt: Date.now(),
    generationJobId: null,
    generationError: null,
    generationErrorDetails: null,
    generationErrorRequestId: null,
  });

  try {
    const jobId = await aiGateway.submitGenerateImageJob({ ...payload, nodeId });
    updateNodeData(nodeId, {
      generationJobId: jobId,
      generationClientSessionId: CURRENT_RUNTIME_SESSION_ID,
    });
  } catch (error) {
    const resolved = resolveErrorContent(error, '图像生成失败');
    updateNodeData(nodeId, {
      isGenerating: false,
      generationStartedAt: null,
      generationJobId: null,
      generationError: resolved.message,
      generationErrorDetails: resolved.details ?? null,
      generationErrorRequestId:
        extractRequestId(resolved.message) ?? extractRequestId(resolved.details),
    });
  }
}

/** Whether an export node has enough stored state to be regenerated. */
export function canRegenerateExportImageNode(data: Record<string, unknown>): boolean {
  return Boolean(data.generationRequestPayload) || Boolean(readFreezoneRedrawRequest(data));
}
