// Copyright (c) 2026 AI anime
import type { CanvasGenerationTaskRef } from "./completeCanvasMediaGenerationTask";
import {
  buildGenerationErrorReport,
  extractRequestId,
} from "./generationErrorReport";
import {
  clearGenerationTaskDescriptor,
  readGenerationTaskDescriptor,
} from "./resumeGeneration";

interface GenerationStoryboardMetadata {
  gridRows: number;
  gridCols: number;
  frameNotes: string[];
}

export interface PollExportImageGenerationParams {
  nodeId: string;
  runtimeSessionId: string;
  errorTitle: string;
  getNodeData: (nodeId: string) => Record<string, unknown> | null;
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void;
}

export interface PollExportImageGenerationDependencies {
  awaitGenerationTask: (
    task: CanvasGenerationTaskRef,
    options: { readonly recoverExpiredTask: boolean },
  ) => Promise<string>;
  prepareNodeImage: (imageUrl: string) => Promise<{
    imageUrl: string;
    aspectRatio: string;
  }>;
  embedStoryboardImageMetadata: (
    imageUrl: string,
    metadata: GenerationStoryboardMetadata,
  ) => Promise<string>;
  uploadLocalImage: (imageUrl: string, filename: string) => Promise<string>;
  showErrorDialog: (
    message: string,
    title: string,
    details?: string,
    reportText?: string,
  ) => void | Promise<void>;
  now: () => number;
  warn: (message: string, context: Record<string, unknown>) => void;
}

function readStoryboardMetadata(
  value: unknown,
): GenerationStoryboardMetadata | null {
  const metadata = value as GenerationStoryboardMetadata | null | undefined;
  if (
    !metadata
    || !Number.isFinite(metadata.gridRows)
    || !Number.isFinite(metadata.gridCols)
    || !Array.isArray(metadata.frameNotes)
  ) {
    return null;
  }
  return metadata;
}

function isCurrentGenerationJob(
  nodeData: Record<string, unknown> | null,
  jobId: string,
): nodeData is Record<string, unknown> {
  return (
    nodeData?.isGenerating === true && nodeData.generationJobId === jobId
  );
}

function finishGenerationWithError(
  params: PollExportImageGenerationParams,
  dependencies: PollExportImageGenerationDependencies,
  nodeData: Record<string, unknown>,
  errorMessage: string,
  errorDetails: string,
  taskKey?: string | null,
): void {
  const generationClientSessionId =
    typeof nodeData.generationClientSessionId === "string"
      ? nodeData.generationClientSessionId
      : "";
  if (generationClientSessionId === params.runtimeSessionId) {
    const reportText = buildGenerationErrorReport({
      errorMessage,
      errorDetails,
      context: nodeData.generationDebugContext,
    });
    void dependencies.showErrorDialog(
      errorMessage,
      params.errorTitle,
      errorDetails,
      reportText,
    );
  }
  params.updateNodeData(params.nodeId, {
    ...clearGenerationTaskDescriptor(taskKey),
    isGenerating: false,
    generationStartedAt: null,
    generationJobId: null,
    generationProviderId: null,
    generationClientSessionId: null,
    generationError: errorMessage,
    generationErrorDetails: errorDetails,
    generationErrorRequestId:
      extractRequestId(errorMessage) ?? extractRequestId(errorDetails),
  });
}

export async function pollExportImageGeneration(
  params: PollExportImageGenerationParams,
  dependencies: PollExportImageGenerationDependencies,
): Promise<void> {
  const currentData = params.getNodeData(params.nodeId);
  if (!currentData) {
    return;
  }

  const jobId = typeof currentData.generationJobId === "string"
    ? currentData.generationJobId.trim()
    : "";
  if (!jobId || currentData.isGenerating !== true) {
    return;
  }

  const task = readGenerationTaskDescriptor(currentData);
  if (!task || task.job_id !== jobId) {
    finishGenerationWithError(
      params,
      dependencies,
      currentData,
      "生成任务信息不完整或任务标识不一致",
      "缺少有效的 task_key、task_type、job_id，无法恢复生成任务",
      task?.task_key,
    );
    return;
  }

  let resultUrl: string;
  try {
    resultUrl = (await dependencies.awaitGenerationTask(task, {
      recoverExpiredTask:
        currentData.generationClientSessionId !== params.runtimeSessionId,
    })).trim();
    if (!resultUrl) {
      throw new Error("生成任务已完成，但没有返回可用的图片地址");
    }
  } catch (error) {
    const latestData = params.getNodeData(params.nodeId);
    if (!isCurrentGenerationJob(latestData, jobId)) {
      clearGenerationTaskDescriptor(task.task_key);
      return;
    }
    const details = error instanceof Error ? error.message : String(error);
    finishGenerationWithError(
      params,
      dependencies,
      latestData,
      details || "图像生成失败",
      details || "图像生成失败",
      task.task_key,
    );
    return;
  }

  const latestData = params.getNodeData(params.nodeId);
  if (!isCurrentGenerationJob(latestData, jobId)) {
    clearGenerationTaskDescriptor(task.task_key);
    return;
  }

  try {
    const prepared = await dependencies.prepareNodeImage(resultUrl);
    const storyboardMetadata = readStoryboardMetadata(
      latestData.generationStoryboardMetadata,
    );
    let imageUrl = resultUrl;
    if (storyboardMetadata) {
      const imageWithMetadata = await dependencies.embedStoryboardImageMetadata(
        prepared.imageUrl,
        {
          gridRows: Math.max(1, Math.round(storyboardMetadata.gridRows)),
          gridCols: Math.max(1, Math.round(storyboardMetadata.gridCols)),
          frameNotes: storyboardMetadata.frameNotes,
        },
      ).catch((error) => {
        dependencies.warn("[GenerationJob] embed storyboard metadata failed", {
          nodeId: params.nodeId,
          error,
        });
        return prepared.imageUrl;
      });
      imageUrl = await dependencies.uploadLocalImage(
        imageWithMetadata,
        `storyboard-gen-${params.nodeId}-${dependencies.now()}.png`,
      );
    }

    if (!isCurrentGenerationJob(params.getNodeData(params.nodeId), jobId)) {
      clearGenerationTaskDescriptor(task.task_key);
      return;
    }

    params.updateNodeData(params.nodeId, {
      ...clearGenerationTaskDescriptor(task.task_key),
      imageUrl,
      previewImageUrl: imageUrl,
      aspectRatio: prepared.aspectRatio,
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
  } catch (error) {
    const current = params.getNodeData(params.nodeId);
    if (!isCurrentGenerationJob(current, jobId)) {
      clearGenerationTaskDescriptor(task.task_key);
      return;
    }
    const details = error instanceof Error ? error.message : String(error);
    finishGenerationWithError(
      params,
      dependencies,
      current,
      `生成结果处理失败: ${details}`,
      details,
      task.task_key,
    );
  }
}
