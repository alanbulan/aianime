// Copyright (c) 2026 AI anime
import type {
  StoryboardExportOptions,
  StoryboardFrameItem,
} from "./storyboard";

export const STORYBOARD_NODE_SIZE_LIMITS = {
  minWidth: 440,
  minHeight: 320,
  maxWidth: 1800,
  maxHeight: 1600,
} as const;

export const STORYBOARD_GRID_GAP_PX = 1;

const STORYBOARD_DERIVED_NODE_MAX_WIDTH = 860;
const STORYBOARD_FRAME_TARGET_WIDTH = 150;
const STORYBOARD_FRAME_NOTE_HEIGHT = 40;
const STORYBOARD_NODE_CHROME_HEIGHT = 70;

export interface StoryboardIncomingImage {
  imageUrl: string;
  previewImageUrl: string | null;
  label: string;
}

export interface StoryboardNodeData {
  frameAspectRatio?: string;
  gridRows: number;
  gridCols: number;
  frames: readonly StoryboardFrameItem[];
  exportOptions?: Partial<StoryboardExportOptions>;
}

export interface StoryboardNodeProjection {
  orderedFrames: StoryboardFrameItem[];
  frameAspectRatio: string;
  frameAspectRatioCss: string;
  gridCols: number;
  gridRows: number;
  totalFrames: number;
  size: { width: number; height: number };
  exportOptions: StoryboardExportOptions;
}

export interface StoryboardSourceNode {
  type?: string;
  data: Record<string, unknown>;
}

export interface StoryboardNodeTypeCatalog {
  upload: string;
  imageEdit: string;
  exportImage: string;
  storyboardSplit: string;
  storyboardGen: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function parseAspectRatioValue(aspectRatio: string | undefined): number {
  if (!aspectRatio) return 1;
  const [rawWidth = "1", rawHeight = "1"] = aspectRatio.split(":");
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 1;
  }
  return width / height;
}

function calculateStoryboardDimensions(
  rows: number,
  cols: number,
  frameAspectRatio: string | undefined,
  maxWidth: number,
): { width: number; height: number } {
  const safeRows = Math.max(1, Math.floor(rows));
  const safeCols = Math.max(1, Math.floor(cols));
  const width = Math.round(
    Math.max(
      STORYBOARD_NODE_SIZE_LIMITS.minWidth,
      Math.min(
        maxWidth,
        safeCols * STORYBOARD_FRAME_TARGET_WIDTH +
          (safeCols - 1) * STORYBOARD_GRID_GAP_PX +
          16,
      ),
    ),
  );
  const contentWidth = Math.max(1, width - 16);
  const frameWidth = Math.max(
    1,
    (contentWidth - (safeCols - 1) * STORYBOARD_GRID_GAP_PX) / safeCols,
  );
  const frameImageHeight = frameWidth / parseAspectRatioValue(frameAspectRatio);
  const frameHeight = frameImageHeight + STORYBOARD_FRAME_NOTE_HEIGHT;
  const gridHeight =
    safeRows * frameHeight + (safeRows - 1) * STORYBOARD_GRID_GAP_PX;
  const height = Math.round(
    Math.max(
      STORYBOARD_NODE_SIZE_LIMITS.minHeight,
      Math.min(
        STORYBOARD_NODE_SIZE_LIMITS.maxHeight,
        gridHeight + STORYBOARD_NODE_CHROME_HEIGHT,
      ),
    ),
  );
  return { width, height };
}

export function resolveStoryboardSplitNodeDimensions(
  rows: number,
  cols: number,
  frameAspectRatio: string | undefined,
): { width: number; height: number } {
  return calculateStoryboardDimensions(
    rows,
    cols,
    frameAspectRatio,
    STORYBOARD_DERIVED_NODE_MAX_WIDTH,
  );
}

export function resolveStoryboardNodeSize(
  rows: number,
  cols: number,
  frameAspectRatio: string,
  width?: number,
  height?: number,
): { width: number; height: number } {
  const fallback = calculateStoryboardDimensions(
    rows,
    cols,
    frameAspectRatio,
    Number.POSITIVE_INFINITY,
  );
  return {
    width: Math.max(
      STORYBOARD_NODE_SIZE_LIMITS.minWidth,
      Math.round(width ?? fallback.width),
    ),
    height: Math.max(
      STORYBOARD_NODE_SIZE_LIMITS.minHeight,
      Math.round(height ?? fallback.height),
    ),
  };
}

export function resolveDerivedAspectRatio(
  sourceNode: StoryboardSourceNode | undefined,
  fallbackAspectRatio: string,
  nodeTypes: StoryboardNodeTypeCatalog,
): string {
  if (!sourceNode) return fallbackAspectRatio;
  const { data, type } = sourceNode;
  if (type === nodeTypes.storyboardGen || type === nodeTypes.imageEdit) {
    const requestAspectRatio = readString(data, "requestAspectRatio");
    const aspectRatio = readString(data, "aspectRatio");
    const preferred =
      requestAspectRatio && requestAspectRatio !== "auto"
        ? requestAspectRatio
        : aspectRatio;
    return preferred || fallbackAspectRatio;
  }
  if (type === nodeTypes.storyboardSplit) {
    return (
      readString(data, "frameAspectRatio") ||
      readString(data, "aspectRatio") ||
      fallbackAspectRatio
    );
  }
  return readString(data, "aspectRatio") || fallbackAspectRatio;
}

export function createDefaultStoryboardExportOptions(): StoryboardExportOptions {
  return {
    showFrameIndex: false,
    showFrameNote: false,
    notePlacement: "overlay",
    imageFit: "cover",
    frameIndexPrefix: "S",
    cellGap: 8,
    outerPadding: 0,
    fontSize: 4,
    backgroundColor: "#0f1115",
    textColor: "#f8fafc",
  };
}

export function resolveStoryboardExportOptions(
  options: Partial<StoryboardExportOptions> | undefined,
): StoryboardExportOptions {
  const merged = {
    ...createDefaultStoryboardExportOptions(),
    ...(options ?? {}),
  };
  const rawFontSize = Number.isFinite(merged.fontSize) ? merged.fontSize : 4;
  const normalizedFontPercent =
    rawFontSize > 20 ? Math.round(rawFontSize / 6) : rawFontSize;
  return {
    ...merged,
    fontSize: clamp(Math.round(normalizedFontPercent), 1, 20),
  };
}

export function storyboardAspectRatioCss(aspectRatio: string): string {
  const [rawWidth = "1", rawHeight = "1"] = aspectRatio.split(":");
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return "1 / 1";
  }
  return `${width} / ${height}`;
}

export function resolveStoryboardNodeProjection(
  data: StoryboardNodeData,
  fallbackAspectRatio: string,
  width?: number,
  height?: number,
): StoryboardNodeProjection {
  const orderedFrames = [...data.frames].sort(
    (left, right) => left.order - right.order,
  );
  const frameAspectRatio =
    data.frameAspectRatio ??
    orderedFrames.find((frame) => typeof frame.aspectRatio === "string")
      ?.aspectRatio ??
    fallbackAspectRatio;
  const gridCols = Math.max(1, data.gridCols);
  const gridRows = Math.max(1, data.gridRows);
  return {
    orderedFrames,
    frameAspectRatio,
    frameAspectRatioCss: storyboardAspectRatioCss(frameAspectRatio),
    gridCols,
    gridRows,
    totalFrames: orderedFrames.length,
    size: resolveStoryboardNodeSize(
      gridRows,
      gridCols,
      frameAspectRatio,
      width,
      height,
    ),
    exportOptions: resolveStoryboardExportOptions(data.exportOptions),
  };
}

export function resolveStoryboardIncomingImages(
  upstreamNodes: readonly StoryboardSourceNode[],
  nodeTypes: StoryboardNodeTypeCatalog,
): StoryboardIncomingImage[] {
  const supportedNodeTypes = new Set([
    nodeTypes.upload,
    nodeTypes.imageEdit,
    nodeTypes.exportImage,
  ]);
  const deduped = new Map<
    string,
    { imageUrl: string; previewImageUrl: string | null }
  >();
  for (const node of upstreamNodes) {
    if (!node.type || !supportedNodeTypes.has(node.type)) continue;
    const imageUrl = readString(node.data, "imageUrl");
    if (!imageUrl || deduped.has(imageUrl)) continue;
    deduped.set(imageUrl, {
      imageUrl,
      previewImageUrl: readString(node.data, "previewImageUrl") ?? null,
    });
  }
  return Array.from(deduped.values()).map((item, index) => ({
    ...item,
    label: `图${index + 1}`,
  }));
}
