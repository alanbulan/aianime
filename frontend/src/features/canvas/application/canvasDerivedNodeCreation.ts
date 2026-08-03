// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeData,
  type ExportImageNodeResultKind,
} from '../domain/canvasNodes';
import {
  DEFAULT_ASPECT_RATIO,
  EXPORT_RESULT_NODE_MIN_HEIGHT,
  EXPORT_RESULT_NODE_MIN_WIDTH,
  createDefaultStoryboardExportOptions,
  resolveDerivedAspectRatio,
  resolveAutoImageNodeDimensions,
  resolveGeneratedImageNodeDimensions,
  resolveStoryboardSplitNodeDimensions,
  type StoryboardFrameItem,
} from '@/modules/creative_canvas/public';
import {
  findAvailableNodePosition,
  getDerivedNodePosition,
  getNodeSize,
  type CanvasNodeSize,
} from '../domain/canvasGeometry';
import { EXPORT_RESULT_DISPLAY_NAME } from '../domain/nodeDisplay';
import type { NodeFactory } from './ports';

export interface CanvasDerivedExportNodeOptions {
  defaultTitle?: string;
  resultKind?: ExportImageNodeResultKind;
  aspectRatioStrategy?: 'provided' | 'derivedFromSource';
  sizeStrategy?: 'generated' | 'autoMinEdge' | 'matchSource';
  matchSourceNodeSize?: boolean;
}

export interface CanvasDerivedExportNodeInput {
  nodes: CanvasNode[];
  sourceNodeId: string;
  imageUrl: string;
  aspectRatio: string;
  previewImageUrl?: string;
  options?: CanvasDerivedExportNodeOptions;
  viewport: { x: number; y: number; zoom: number };
  viewportSize: { width: number; height: number };
}

function withExplicitSize(
  node: CanvasNode,
  size: CanvasNodeSize,
): CanvasNode {
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
  nodes: CanvasNode[],
  sourceNodeId: string,
  imageUrl: string,
  aspectRatio: string,
  previewImageUrl: string | undefined,
  nodeFactory: NodeFactory,
): CanvasNode {
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  const resolvedAspectRatio = resolveDerivedAspectRatio(
    sourceNode,
    aspectRatio,
    CANVAS_NODE_TYPES,
  );
  const node = nodeFactory.createNode(
    CANVAS_NODE_TYPES.upload,
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
  sourceNode: CanvasNode | undefined,
  aspectRatio: string,
  options: CanvasDerivedExportNodeOptions | undefined,
): CanvasNodeSize {
  const minSize = {
    minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
    minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
  };
  const sizeStrategy = options?.sizeStrategy
    ?? (options?.matchSourceNodeSize ? 'matchSource' : 'generated');
  if (sizeStrategy === 'autoMinEdge') {
    return resolveAutoImageNodeDimensions(aspectRatio, minSize);
  }
  if (sizeStrategy === 'matchSource' && sourceNode) {
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
): Partial<CanvasNodeData> {
  const data = {
    imageUrl,
    previewImageUrl: previewImageUrl ?? null,
    aspectRatio,
  } as Partial<CanvasNodeData> & {
    displayName?: string;
    resultKind?: ExportImageNodeResultKind;
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
  nodeFactory: NodeFactory,
): CanvasNode {
  const sourceNode = input.nodes.find((node) => node.id === input.sourceNodeId);
  const aspectRatioStrategy = input.options?.aspectRatioStrategy ?? 'provided';
  const resolvedAspectRatio = aspectRatioStrategy === 'derivedFromSource'
    ? resolveDerivedAspectRatio(
        sourceNode,
        input.aspectRatio,
        CANVAS_NODE_TYPES,
      )
    : (input.aspectRatio ||
      resolveDerivedAspectRatio(
        sourceNode,
        DEFAULT_ASPECT_RATIO,
        CANVAS_NODE_TYPES,
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
    CANVAS_NODE_TYPES.exportImage,
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
  nodes: CanvasNode[],
  sourceNodeId: string,
  rows: number,
  cols: number,
  frames: StoryboardFrameItem[],
  frameAspectRatio: string | undefined,
  nodeFactory: NodeFactory,
): CanvasNode {
  const resolvedFrameAspectRatio = frameAspectRatio
    ?? frames.find((frame) => typeof frame.aspectRatio === 'string')?.aspectRatio
    ?? DEFAULT_ASPECT_RATIO;
  const node = nodeFactory.createNode(
    CANVAS_NODE_TYPES.storyboardSplit,
    getDerivedNodePosition(nodes, sourceNodeId),
    {
      gridRows: rows,
      gridCols: cols,
      frames,
      aspectRatio: resolvedFrameAspectRatio,
      frameAspectRatio: resolvedFrameAspectRatio,
      exportOptions: createDefaultStoryboardExportOptions(),
    },
  );
  return withExplicitSize(
    node,
    resolveStoryboardSplitNodeDimensions(rows, cols, resolvedFrameAspectRatio),
  );
}
