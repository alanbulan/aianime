// Copyright (c) 2026 AI anime
import type { CanvasImageJobGateway } from "./canvasImageJob";
import {
  buildGenerationErrorReport,
  extractRequestId,
} from "./generationErrorReport";

export const EXPORT_IMAGE_GENERATION_POLL_INTERVAL_MS = 1400;

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
  getGenerateImageJob: CanvasImageJobGateway["getGenerateImageJob"];
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
  sleep: (delayMs: number) => Promise<void>;
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

export async function pollExportImageGeneration(
  params: PollExportImageGenerationParams,
  dependencies: PollExportImageGenerationDependencies,
): Promise<void> {
  while (true) {
    const currentData = params.getNodeData(params.nodeId);
    if (!currentData) {
      return;
    }

    const jobId = typeof currentData.generationJobId === "string"
      ? currentData.generationJobId
      : "";
    if (!jobId || currentData.isGenerating !== true) {
      return;
    }

    let status: Awaited<
      ReturnType<CanvasImageJobGateway["getGenerateImageJob"]>
    >;
    try {
      status = await dependencies.getGenerateImageJob(jobId);
    } catch (error) {
      dependencies.warn("[GenerationJob] poll failed", {
        nodeId: params.nodeId,
        jobId,
        error,
      });
      await dependencies.sleep(EXPORT_IMAGE_GENERATION_POLL_INTERVAL_MS);
      continue;
    }

    if (status.status === "queued" || status.status === "running") {
      await dependencies.sleep(EXPORT_IMAGE_GENERATION_POLL_INTERVAL_MS);
      continue;
    }

    const latestData = params.getNodeData(params.nodeId);
    if (!isCurrentGenerationJob(latestData, jobId)) {
      return;
    }

    if (
      status.status === "succeeded"
      && typeof status.result === "string"
      && status.result.trim()
    ) {
      const resultUrl = status.result.trim();
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
        return;
      }

      params.updateNodeData(params.nodeId, {
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
      return;
    }

    const errorMessage = status.error
      ?? (status.status === "not_found"
        ? "generation job not found"
        : "generation failed");
    const generationClientSessionId =
      typeof latestData.generationClientSessionId === "string"
        ? latestData.generationClientSessionId
        : "";
    if (generationClientSessionId === params.runtimeSessionId) {
      const reportText = buildGenerationErrorReport({
        errorMessage,
        errorDetails: status.error ?? undefined,
        context: latestData.generationDebugContext,
      });
      void dependencies.showErrorDialog(
        errorMessage,
        params.errorTitle,
        status.error ?? undefined,
        reportText,
      );
    }
    params.updateNodeData(params.nodeId, {
      isGenerating: false,
      generationStartedAt: null,
      generationJobId: null,
      generationProviderId: null,
      generationClientSessionId: null,
      generationError: errorMessage,
      generationErrorDetails: status.error ?? null,
      generationErrorRequestId:
        extractRequestId(errorMessage) ?? extractRequestId(status.error),
    });
    return;
  }
}
