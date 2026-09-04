// Copyright (c) 2026 AI anime
import { DEFAULT_ASPECT_RATIO } from "../domain/aspectRatio";
import { CANVAS_CONNECTION_NODE_TYPES } from "../domain/canvasConnection";
import {
  findAvailableNodePosition,
  getDerivedNodePosition,
  getNodeSize,
} from "../domain/canvasGeometry";
import {
  EXPORT_RESULT_NODE_MIN_HEIGHT,
  EXPORT_RESULT_NODE_MIN_WIDTH,
  resolveAutoImageNodeDimensions,
  resolveGeneratedImageNodeDimensions,
} from "../domain/imageNodeLayout";
import { EXPORT_RESULT_DISPLAY_NAME, type CanvasExportResultKind } from "../domain/nodeDisplay";
import type { StoryboardFrameItem } from "../domain/storyboard";
import { inheritMainlineFields } from "../domain/inheritMainlineFields";
import {
  resolveDerivedAspectRatio,
  resolveStoryboardSplitNodeDimensions,
  createDefaultStoryboardExportOptions,
  type StoryboardNodeTypeCatalog,
} from "../domain/storyboardNodeModel";

const STORYBOARD_NODE_TYPES: StoryboardNodeTypeCatalog = {
  upload: CANVAS_CONNECTION_NODE_TYPES.upload,
  imageEdit: CANVAS_CONNECTION_NODE_TYPES.imageEdit,
  exportImage: CANVAS_CONNECTION_NODE_TYPES.exportImage,
  storyboardGen: CANVAS_CONNECTION_NODE_TYPES.storyboardGen,
  storyboardSplit: CANVAS_CONNECTION_NODE_TYPES.storyboardSplit,
};

export interface CanvasDerivedExportNodeOptions {
  defaultTitle?: string;
  resultKind?: CanvasExportResultKind;
  aspectRatioStrategy?: "provided" | "derivedFromSource";
  sizeStrategy?: "generated" | "autoMinEdge" | "matchSource";
  matchSourceNodeSize?: boolean;
}

export interface CanvasDerivedExportNodeInput {
  nodes: DerivedGraphNode[];
  sourceNodeId: string;
  imageUrl: string;
  aspectRatio: string;
  previewImageUrl?: string;
  options?: CanvasDerivedExportNodeOptions;
  viewport: { x: number; y: number; zoom: number };
  viewportSize: { width: number; height: number };
}

export interface CanvasStoryboardSplitParameters {
  lineThicknessPercent?: number;
  lineThicknessPx?: number;
}

export interface DerivedGraphNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
  style?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface DerivedCreatedNode {
  id: string;
  type?: string | null;
  position: { x: number; y: number };
  data?: Record<string, unknown> | null;
  style?: Record<string, unknown> | null;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface DerivedNodeFactory {
  createNode: (
    type: unknown,
    position: unknown,
    data?: unknown,
  ) => DerivedCreatedNode;
}

function withExplicitSize(
  node: DerivedCreatedNode,
  size: { width: number; height: number },
): DerivedCreatedNode {
  return {
    ...node,
    width: size.width,
    height: size.height,
    style: {
      ...(node.style ?? {}),
      width: size.width,
      height: size.height,
    },
  };
}

export function createCanvasDerivedUploadNode(
  nodes: DerivedGraphNode[],
  sourceNodeId: string,
  imageUrl: string,
  aspectRatio: string,
  previewImageUrl: string | undefined,
  nodeFactory: DerivedNodeFactory,
): DerivedCreatedNode {
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  const resolvedAspectRatio = resolveDerivedAspectRatio(
    sourceNode,
    aspectRatio,
    STORYBOARD_NODE_TYPES,
  );
  const node = nodeFactory.createNode(
    CANVAS_CONNECTION_NODE_TYPES.upload,
    getDerivedNodePosition(nodes, sourceNodeId),
    {
      imageUrl,
      previewImageUrl: previewImageUrl ?? null,
      aspectRatio: resolvedAspectRatio,
    },
  );
  return withExplicitSize(
    node,
    resolveGeneratedImageNodeDimensions(resolvedAspectRatio),
  );
}

function resolveExportNodeSize(
  sourceNode: DerivedGraphNode | undefined,
  aspectRatio: string,
  options: CanvasDerivedExportNodeOptions | undefined,
): { width: number; height: number } {
  const minSize = {
    minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
    minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
  };
  const sizeStrategy = options?.sizeStrategy
    ?? (options?.matchSourceNodeSize ? "matchSource" : "generated");
  if (sizeStrategy === "autoMinEdge") {
    return resolveAutoImageNodeDimensions(aspectRatio, minSize);
  }
  if (sizeStrategy === "matchSource" && sourceNode) {
    const sourceSize = getNodeSize(sourceNode);
    return {
      width: Math.max(1, Math.round(sourceSize.width)),
      height: Math.max(1, Math.round(sourceSize.height)),
    };
  }
  return resolveGeneratedImageNodeDimensions(aspectRatio, minSize);
}

function createExportNodeData(
  imageUrl: string,
  previewImageUrl: string | undefined,
  aspectRatio: string,
  options: CanvasDerivedExportNodeOptions | undefined,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    imageUrl,
    previewImageUrl: previewImageUrl ?? null,
    aspectRatio,
  };
  if (options?.defaultTitle) {
    data.displayName = options.defaultTitle;
  }
  if (options?.resultKind) {
    data.resultKind = options.resultKind;
    if (!options.defaultTitle) {
      data.displayName = EXPORT_RESULT_DISPLAY_NAME[options.resultKind];
    }
  }
  return data;
}

export function createCanvasDerivedExportNode(
  input: CanvasDerivedExportNodeInput,
  nodeFactory: DerivedNodeFactory,
): DerivedCreatedNode {
  const sourceNode = input.nodes.find((node) => node.id === input.sourceNodeId);
  const aspectRatioStrategy = input.options?.aspectRatioStrategy ?? "provided";
  const resolvedAspectRatio = aspectRatioStrategy === "derivedFromSource"
    ? resolveDerivedAspectRatio(
        sourceNode,
        input.aspectRatio,
        STORYBOARD_NODE_TYPES,
      )
    : (input.aspectRatio ||
      resolveDerivedAspectRatio(
        sourceNode,
        DEFAULT_ASPECT_RATIO,
        STORYBOARD_NODE_TYPES,
      ));
  const size = resolveExportNodeSize(
    sourceNode,
    resolvedAspectRatio,
    input.options,
  );
  const position = findAvailableNodePosition({
    nodes: input.nodes,
    sourceNodeId: input.sourceNodeId,
    newNodeWidth: size.width,
    newNodeHeight: size.height,
    viewport: input.viewport,
    viewportSize: input.viewportSize,
  });
  const node = nodeFactory.createNode(
    CANVAS_CONNECTION_NODE_TYPES.exportImage,
    position,
    createExportNodeData(
      input.imageUrl,
      input.previewImageUrl,
      resolvedAspectRatio,
      input.options,
    ),
  );
  return withExplicitSize(node, size);
}

export function createCanvasStoryboardSplitNode(
  nodes: DerivedGraphNode[],
  sourceNodeId: string,
  rows: number,
  cols: number,
  frames: StoryboardFrameItem[],
  frameAspectRatio: string | undefined,
  nodeFactory: DerivedNodeFactory,
  parameters: CanvasStoryboardSplitParameters = {},
): DerivedCreatedNode {
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  const resolvedFrameAspectRatio = frameAspectRatio
    ?? frames.find((frame) => typeof frame.aspectRatio === "string")?.aspectRatio
    ?? DEFAULT_ASPECT_RATIO;
  const node = nodeFactory.createNode(
    CANVAS_CONNECTION_NODE_TYPES.storyboardSplit,
    getDerivedNodePosition(nodes, sourceNodeId),
    inheritMainlineFields(
      sourceNode ? { data: sourceNode.data } : null,
      {
        gridRows: rows,
        gridCols: cols,
        frames,
        aspectRatio: resolvedFrameAspectRatio,
        frameAspectRatio: resolvedFrameAspectRatio,
        exportOptions: createDefaultStoryboardExportOptions(),
        ...(typeof parameters.lineThicknessPercent === "number"
          ? { splitLineThicknessPercent: parameters.lineThicknessPercent }
          : {}),
        ...(typeof parameters.lineThicknessPx === "number"
          ? { splitLineThicknessPx: parameters.lineThicknessPx }
          : {}),
      },
    ),
  );
  return withExplicitSize(
    node,
    resolveStoryboardSplitNodeDimensions(rows, cols, resolvedFrameAspectRatio),
  );
}
