// Copyright (c) 2026 AI anime
import { extractRequestId } from "./generationErrorReport";
import { resolveErrorContent } from "./errorDialog";
import type {
  CanvasImageJobGateway,
  CanvasImageJobPayload,
} from "./canvasImageJob";
import type { CanvasGenerationTaskRef } from "./completeCanvasMediaGenerationTask";
import type {
  GenerateCanvasRedrawParams,
  GenerateCanvasRedrawResult,
} from "./generateCanvasRedraw";
import type {
  GenerateCanvasGridActionParams,
  GenerateCanvasGridActionResult,
} from "./generateCanvasGridAction";
import {
  clearGenerationTaskDescriptor,
  generationTaskDescriptor,
} from "./resumeGeneration";
import {
  resolveCanvasRedrawAspectRatio,
  resolveCanvasRedrawImageSize,
  type CanvasRedrawAspectRatio,
  type CanvasRedrawImageSize,
} from "../domain/redraw";
import { isGridActionKey, type GridActionKey } from "../domain/gridAction";

/**
 * Params persisted on an export node created by the 擦除 / 重绘 flow, so a failed
 * node can re-run its freezone `redraw` call without the overlay being mounted.
 */
interface FreezoneRedrawRequest {
  sourceUrl: string;
  maskUrl?: string;
  prompt?: string;
  aspectRatio: CanvasRedrawAspectRatio;
  imageSize: CanvasRedrawImageSize;
  model: string;
  modelSelector?: string;
}

interface FreezoneGridActionRequest {
  sourceUrl: string;
  actionKey: GridActionKey;
  prompt: string;
  model: string;
  modelSelector?: string;
}

export interface RegenerateExportImageNodeParams {
  nodeId: string;
  nodeData: Record<string, unknown>;
  projectId: string;
  canvasId: string;
  runtimeSessionId: string;
  updateNodeData: (
    nodeId: string,
    patch: Record<string, unknown>,
  ) => void;
}

export interface RegenerateExportImageNodeDependencies {
  readonly aiGateway: CanvasImageJobGateway;
  readonly generateRedraw: (
    params: GenerateCanvasRedrawParams,
    onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
  ) => Promise<GenerateCanvasRedrawResult>;
  readonly generateGridAction: (
    params: GenerateCanvasGridActionParams,
    onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
  ) => Promise<GenerateCanvasGridActionResult>;
}

function readFreezoneRedrawRequest(
  data: Record<string, unknown>,
): FreezoneRedrawRequest | undefined {
  const req = data.freezoneRedrawRequest as Partial<FreezoneRedrawRequest> | undefined;
  if (
    !req
    || typeof req.sourceUrl !== "string"
    || typeof req.model !== "string"
    || !req.model.trim()
  ) {
    return undefined;
  }
  return {
    sourceUrl: req.sourceUrl,
    ...(typeof req.maskUrl === "string" && req.maskUrl.trim()
      ? { maskUrl: req.maskUrl }
      : {}),
    ...(typeof req.prompt === "string" ? { prompt: req.prompt } : {}),
    aspectRatio: resolveCanvasRedrawAspectRatio(req.aspectRatio),
    imageSize: resolveCanvasRedrawImageSize(req.imageSize),
    model: req.model.trim(),
    ...(typeof req.modelSelector === "string" && req.modelSelector.trim()
      ? { modelSelector: req.modelSelector.trim() }
      : {}),
  };
}

function readFreezoneGridActionRequest(
  data: Record<string, unknown>,
): FreezoneGridActionRequest | undefined {
  const request = data.gridActionRequest as
    | Partial<FreezoneGridActionRequest>
    | undefined;
  if (
    !request
    || typeof request.sourceUrl !== "string"
    || !request.sourceUrl.trim()
    || !isGridActionKey(request.actionKey)
    || typeof request.prompt !== "string"
    || !request.prompt.trim()
    || typeof request.model !== "string"
    || !request.model.trim()
  ) {
    return undefined;
  }
  return {
    sourceUrl: request.sourceUrl,
    actionKey: request.actionKey,
    prompt: request.prompt,
    model: request.model.trim(),
    ...(typeof request.modelSelector === "string" && request.modelSelector.trim()
      ? { modelSelector: request.modelSelector.trim() }
      : {}),
  };
}

/** Retry a failed 擦除/重绘 export node by re-running its stored freezone redraw. */
async function regenerateFreezoneRedrawNode(
  params: RegenerateExportImageNodeParams,
  request: FreezoneRedrawRequest,
  generateRedraw: RegenerateExportImageNodeDependencies["generateRedraw"],
): Promise<void> {
  const { nodeId, projectId, updateNodeData } = params;
  updateNodeData(nodeId, {
    ...clearGenerationTaskDescriptor(
      typeof params.nodeData.generationTaskKey === "string"
        ? params.nodeData.generationTaskKey
        : null,
    ),
    isGenerating: true,
    generationStartedAt: Date.now(),
    generationError: null,
  });

  let taskKey: string | null = null;
  try {
    const { url } = await generateRedraw(
      {
        projectId,
        sourceUrl: request.sourceUrl,
        maskUrl: request.maskUrl ?? null,
        prompt: request.prompt,
        aspectRatio: request.aspectRatio,
        imageSize: request.imageSize,
        model: request.model,
        modelSelector: request.modelSelector,
      },
      (task) => {
        taskKey = task.task_key;
        updateNodeData(nodeId, generationTaskDescriptor(task));
      },
    );
    updateNodeData(nodeId, {
      ...clearGenerationTaskDescriptor(taskKey),
      imageUrl: url,
      previewImageUrl: url,
      isGenerating: false,
      generationStartedAt: null,
      generationError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[regenerate] freezone redraw failed", error);
    updateNodeData(nodeId, {
      ...clearGenerationTaskDescriptor(taskKey),
      isGenerating: false,
      generationStartedAt: null,
      generationError: message,
    });
  }
}

async function regenerateFreezoneGridActionNode(
  params: RegenerateExportImageNodeParams,
  request: FreezoneGridActionRequest,
  generateGridAction: RegenerateExportImageNodeDependencies["generateGridAction"],
): Promise<void> {
  const { nodeId, projectId, updateNodeData } = params;
  updateNodeData(nodeId, {
    ...clearGenerationTaskDescriptor(
      typeof params.nodeData.generationTaskKey === "string"
        ? params.nodeData.generationTaskKey
        : null,
    ),
    isGenerating: true,
    generationStartedAt: Date.now(),
    generationError: null,
    generationErrorDetails: null,
  });

  let taskKey: string | null = null;
  try {
    const { url } = await generateGridAction(
      {
        projectId,
        canvasId: params.canvasId,
        nodeId,
        sourceUrl: request.sourceUrl,
        actionKey: request.actionKey,
        prompt: request.prompt,
        model: request.model,
        modelSelector: request.modelSelector,
      },
      (task) => {
        taskKey = task.task_key;
        updateNodeData(nodeId, generationTaskDescriptor(task));
      },
    );
    updateNodeData(nodeId, {
      ...clearGenerationTaskDescriptor(taskKey),
      imageUrl: url,
      previewImageUrl: url,
      isGenerating: false,
      generationStartedAt: null,
      generationError: null,
      generationErrorDetails: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[regenerate] grid action failed", error);
    updateNodeData(nodeId, {
      ...clearGenerationTaskDescriptor(taskKey),
      isGenerating: false,
      generationStartedAt: null,
      generationError: message,
      generationErrorDetails: message,
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
  dependencies: RegenerateExportImageNodeDependencies,
): Promise<void> {
  const {
    canvasId,
    nodeData,
    nodeId,
    projectId,
    runtimeSessionId,
    updateNodeData,
  } = params;
  if (nodeData.isGenerating === true) {
    return;
  }

  const freezoneRequest = readFreezoneRedrawRequest(nodeData);
  if (freezoneRequest) {
    await regenerateFreezoneRedrawNode(
      params,
      freezoneRequest,
      dependencies.generateRedraw,
    );
    return;
  }

  const gridActionRequest = readFreezoneGridActionRequest(nodeData);
  if (gridActionRequest) {
    await regenerateFreezoneGridActionNode(
      params,
      gridActionRequest,
      dependencies.generateGridAction,
    );
    return;
  }

  const payload = nodeData.generationRequestPayload as
    | CanvasImageJobPayload
    | undefined;
  if (!payload) {
    console.warn(
      "[regenerate] export node has no stored payload, cannot retry",
      nodeId,
    );
    return;
  }

  updateNodeData(nodeId, {
    ...clearGenerationTaskDescriptor(
      typeof nodeData.generationTaskKey === "string"
        ? nodeData.generationTaskKey
        : null,
    ),
    isGenerating: true,
    generationStartedAt: Date.now(),
    generationJobId: null,
    generationError: null,
    generationErrorDetails: null,
    generationErrorRequestId: null,
  });

  let task: CanvasGenerationTaskRef | null = null;
  try {
    task = await dependencies.aiGateway.submitGenerateImageJob(
      { projectId, canvasId },
      { ...payload, nodeId },
    );
    updateNodeData(nodeId, {
      ...generationTaskDescriptor(task),
      generationJobId: task.job_id,
      generationClientSessionId: runtimeSessionId,
    });
  } catch (error) {
    const resolved = resolveErrorContent(error, "图像生成失败");
    updateNodeData(nodeId, {
      ...clearGenerationTaskDescriptor(task?.task_key),
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
export function canRegenerateExportImageNode(
  data: Record<string, unknown>,
): boolean {
  return (
    Boolean(data.generationRequestPayload)
    || Boolean(readFreezoneRedrawRequest(data))
    || Boolean(readFreezoneGridActionRequest(data))
  );
}
