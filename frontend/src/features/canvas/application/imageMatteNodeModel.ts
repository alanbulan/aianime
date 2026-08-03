// Copyright (c) 2026 AI anime
import type {
  CanvasNodeData,
  ExportImageNodeData,
} from "@/features/canvas/domain/canvasNodes";
import {
  inheritMainlineFields,
  type MainlineFieldsSource,
} from "@/modules/creative_canvas/public";

export function buildImageMatteInitialData(
  sourceData: CanvasNodeData,
  displayName: string,
  generationStartedAt: number,
): Partial<ExportImageNodeData> {
  const aspectRatio =
    typeof (sourceData as { aspectRatio?: unknown }).aspectRatio === "string"
      ? ((sourceData as { aspectRatio: string }).aspectRatio || "1:1")
      : "1:1";

  const source = sourceData as {
    mainline_context?: MainlineFieldsSource["mainline_context"];
    slot_target?: MainlineFieldsSource["slot_target"];
    committed_slot_url?: string | null;
    projection_key?: string;
  };
  const childPatch: Partial<ExportImageNodeData> = {
    displayName,
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio,
    resultKind: "matte",
    isGenerating: true,
    generationStartedAt,
  };

  return inheritMainlineFields(
    {
      data: {
        mainline_context: source.mainline_context,
        slot_target: source.slot_target,
        committed_slot_url: source.committed_slot_url ?? undefined,
        projection_key: source.projection_key,
      },
    },
    childPatch,
  );
}

export function buildImageMatteSuccessPatch(
  imageUrl: string,
): Partial<ExportImageNodeData> {
  return {
    imageUrl,
    previewImageUrl: imageUrl,
    isGenerating: false,
    generationStartedAt: null,
    generationError: null,
    generationErrorDetails: null,
  };
}

export function buildImageMatteFailurePatch(
  message: string,
): Partial<ExportImageNodeData> {
  return {
    isGenerating: false,
    generationStartedAt: null,
    generationError: message,
    generationErrorDetails: message,
  };
}

export function resolveImageMatteUploadFilename(
  sourceNodeId: string,
  timestamp: number,
): string {
  return `matte-${sourceNodeId}-${timestamp}.png`;
}
