// Copyright (c) 2026 AI anime
import { buildGenerationErrorReport } from "./generationErrorReport";
import { sanitizeStoryboardText } from "../domain/storyboardText";

export interface NodeActionToolbarNode {
  id: string;
  type?: string | null;
  data: Record<string, unknown>;
}

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

function nodeData(node: NodeActionToolbarNode): Record<string, unknown> {
  return node.data ?? {};
}

export function projectNodeActionGenerationError(
  node: NodeActionToolbarNode,
  fallbackErrorMessage: string,
): NodeActionGenerationErrorProjection {
  const canExpose =
    node.type === "exportImageNode" || node.type === "imageGenNode";
  const data = nodeData(node);
  const generationError = canExpose
    ? trimmedString(data.generationError)
    : "";
  const generationErrorDetails = canExpose
    ? trimmedString(data.generationErrorDetails)
    : "";

  if (node.type === "imageGenNode") {
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
      context: data.generationDebugContext,
    }),
  };
}

export function projectNodeActionStoryboardText(
  node: NodeActionToolbarNode,
  ignoreAtTag: boolean,
  formatLine: NodeActionStoryboardLineFormatter,
): NodeActionStoryboardTextProjection {
  if (node.type === "storyboardGenNode") {
    const frames = Array.isArray(nodeData(node).frames)
      ? (nodeData(node).frames as Array<{
          description?: unknown;
          note?: unknown;
          order?: unknown;
        }>)
      : [];
    return {
      canCopy: true,
      text: frames
        .map((frame, index) =>
          formatLine(
            String(index + 1).padStart(2, "0"),
            sanitizeStoryboardText(
              typeof frame.description === "string" ? frame.description : "",
              ignoreAtTag,
            ),
          ),
        )
        .join("\n"),
    };
  }

  if (node.type === "storyboardSplitNode") {
    const frames = Array.isArray(nodeData(node).frames)
      ? (nodeData(node).frames as Array<{
          description?: unknown;
          note?: unknown;
          order?: unknown;
        }>)
      : [];
    const orderedFrames = [...frames].sort(
      (left, right) =>
        (typeof left.order === "number" ? left.order : 0) -
        (typeof right.order === "number" ? right.order : 0),
    );
    return {
      canCopy: true,
      text: orderedFrames
        .map((frame, index) =>
          formatLine(
            String(index + 1).padStart(2, "0"),
            sanitizeStoryboardText(
              typeof frame.note === "string" ? frame.note : "",
              ignoreAtTag,
            ),
          ),
        )
        .join("\n"),
    };
  }

  return { canCopy: false, text: "" };
}

export function resolveNodeActionImageDownloadFilename(
  node: NodeActionToolbarNode,
): string {
  const data = nodeData(node);
  const sourceFileName = trimmedString(data.sourceFileName);
  if (sourceFileName) return sourceFileName;

  const displayName = trimmedString(data.displayName);
  return displayName ? `${displayName}.png` : `node-${node.id}.png`;
}
