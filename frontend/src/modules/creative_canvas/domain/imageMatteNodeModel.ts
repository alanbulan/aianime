// Copyright (c) 2026 AI anime
import {
  inheritMainlineFields,
  type MainlineFieldsSource,
} from "./inheritMainlineFields";

type ImageMatteSourceData = Omit<
  MainlineFieldsSource,
  "committed_slot_url"
> & {
  aspectRatio?: unknown;
  committed_slot_url?: string | null;
};

export interface ImageMatteNodePatch extends Record<string, unknown> {
  displayName?: string;
  imageUrl?: string | null;
  previewImageUrl?: string | null;
  aspectRatio?: string;
  resultKind?: "matte";
  isGenerating?: boolean;
  generationStartedAt?: number | null;
  generationError?: string | null;
  generationErrorDetails?: string | null;
}

export function buildImageMatteInitialData(
  sourceData: object,
  displayName: string,
  generationStartedAt: number,
) {
  const source = sourceData as ImageMatteSourceData;
  const aspectRatio =
    typeof source.aspectRatio === "string"
      ? source.aspectRatio || "1:1"
      : "1:1";
  const childPatch: ImageMatteNodePatch = {
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
): ImageMatteNodePatch {
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
): ImageMatteNodePatch {
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
