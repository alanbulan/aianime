// Copyright (c) 2026 AI anime
import {
  isExportImageNode,
  isImageGenNode,
  isStoryboardGenNode,
  isStoryboardSplitNode,
  type CanvasNode,
} from "@/features/canvas/domain/canvasNodes";

import { buildGenerationErrorReport } from "./generationErrorReport";
import { sanitizeStoryboardText } from "./storyboardText";

export interface NodeActionGenerationErrorProjection {
  canCopy: boolean;
  report: string;
}

export interface NodeActionStoryboardTextProjection {
  canCopy: boolean;
  text: string;
}

export type NodeActionStoryboardLineFormatter = (
  index: string,
  content: string,
) => string;

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function projectNodeActionGenerationError(
  node: CanvasNode,
  fallbackErrorMessage: string,
): NodeActionGenerationErrorProjection {
  const canExpose = isExportImageNode(node) || isImageGenNode(node);
  const generationError = canExpose
    ? trimmedString(
        (node.data as { generationError?: unknown }).generationError,
      )
    : "";
  const generationErrorDetails = canExpose
    ? trimmedString(
        (node.data as { generationErrorDetails?: unknown })
          .generationErrorDetails,
      )
    : "";

  if (isImageGenNode(node)) {
    return {
      canCopy: generationError.length > 0,
      report: generationErrorDetails || generationError,
    };
  }

  return {
    canCopy: canExpose && generationError.length > 0,
    report: buildGenerationErrorReport({
      errorMessage: generationError || fallbackErrorMessage,
      errorDetails: generationErrorDetails || undefined,
      context: (node.data as { generationDebugContext?: unknown })
        .generationDebugContext,
    }),
  };
}

export function projectNodeActionStoryboardText(
  node: CanvasNode,
  ignoreAtTag: boolean,
  formatLine: NodeActionStoryboardLineFormatter,
): NodeActionStoryboardTextProjection {
  if (isStoryboardGenNode(node)) {
    return {
      canCopy: true,
      text: node.data.frames
        .map((frame, index) =>
          formatLine(
            String(index + 1).padStart(2, "0"),
            sanitizeStoryboardText(frame.description ?? "", ignoreAtTag),
          ),
        )
        .join("\n"),
    };
  }

  if (isStoryboardSplitNode(node)) {
    const orderedFrames = [...node.data.frames].sort(
      (left, right) => left.order - right.order,
    );
    return {
      canCopy: true,
      text: orderedFrames
        .map((frame, index) =>
          formatLine(
            String(index + 1).padStart(2, "0"),
            sanitizeStoryboardText(frame.note ?? "", ignoreAtTag),
          ),
        )
        .join("\n"),
    };
  }

  return { canCopy: false, text: "" };
}

export function resolveNodeActionImageDownloadFilename(
  node: CanvasNode,
): string {
  const sourceFileName = trimmedString(
    (node.data as { sourceFileName?: unknown }).sourceFileName,
  );
  if (sourceFileName) return sourceFileName;

  const displayName = trimmedString(
    (node.data as { displayName?: unknown }).displayName,
  );
  return displayName ? `${displayName}.png` : `node-${node.id}.png`;
}
