// Copyright (c) 2026 AI anime
import {
  AUTO_REQUEST_ASPECT_RATIO,
  DEFAULT_ASPECT_RATIO,
  type StoryboardGenFrameItem,
  type StoryboardRatioControlMode,
} from '@/features/canvas/domain/canvasNodes';
import {
  parseAspectRatio,
  pickClosestAspectRatio,
} from '@/modules/creative_canvas/public';
import { findReferenceTokens } from '@/features/canvas/application/referenceTokenEditing';
import {
  sanitizeStoryboardPromptText,
  sanitizeStoryboardText,
} from '@/features/canvas/application/storyboardText';

export interface StoryboardAspectRatioChoice {
  value: string;
  label: string;
}

export interface StoryboardGenResolvedAspectRatios {
  cellRatioValue: number;
  overallRatioValue: number;
  cellAspectRatio: string;
  overallAspectRatio: string;
  cellAspectRatioLabel: string;
  overallAspectRatioLabel: string;
}

export interface StoryboardGenLayoutProjection {
  baseSize: { width: number; height: number };
  size: { width: number; height: number };
  cellWidth: number;
  gridWidth: number;
  paramsRowWidth: number;
  cellAspectRatioCss: string;
}

export const STORYBOARD_GEN_AUTO_ASPECT_RATIO_OPTION: StoryboardAspectRatioChoice = {
  value: AUTO_REQUEST_ASPECT_RATIO,
  label: '自动',
};

export const STORYBOARD_GEN_NODE_SIZE_LIMITS = {
  minWidth: 470,
  minHeight: 470,
  maxWidth: 1800,
  maxHeight: 1400,
} as const;

export const STORYBOARD_GEN_FRAME_GRID_GAP_PX = 8;

const STORYBOARD_NODE_HORIZONTAL_PADDING_PX = 24;
const STORYBOARD_GRID_BASE_CELL_HEIGHT_PX = 118;
const STORYBOARD_GRID_MAX_WIDTH_PX = 420;
const STORYBOARD_CONTROL_ROW_WIDTH_PX = 420;
const STORYBOARD_PARAMS_ROW_WIDTH_PX = 420;
const CONFIG_ROW_HEIGHT_PX = 28;
const CONFIG_ROW_MARGIN_BOTTOM_PX = 12;
const ADVANCED_RATIO_INFO_HEIGHT_PX = 22;
const FRAME_GRID_MARGIN_BOTTOM_PX = 20;
const PARAM_ROW_HEIGHT_PX = 38;
const NODE_VERTICAL_PADDING_PX = 24;
const FRAME_CELL_MIN_WIDTH_PX = 24;
const FRAME_CELL_MIN_HEIGHT_PX = 16;
const FRIENDLY_ASPECT_RATIO_CANDIDATES = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '21:9',
  '9:21',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
];

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const next = b;
    b = a % b;
    a = next;
  }
  return a || 1;
}

export function storyboardRatioValueToAspectRatio(
  ratioValue: number,
): string {
  if (!Number.isFinite(ratioValue) || ratioValue <= 0) {
    return DEFAULT_ASPECT_RATIO;
  }
  const scaledWidth = Math.max(1, Math.round(ratioValue * 1000));
  const scaledHeight = 1000;
  const divisor = greatestCommonDivisor(scaledWidth, scaledHeight);
  return `${Math.round(scaledWidth / divisor)}:${Math.round(scaledHeight / divisor)}`;
}

export function formatStoryboardAspectRatio(ratioValue: number): string {
  if (!Number.isFinite(ratioValue) || ratioValue <= 0) {
    return DEFAULT_ASPECT_RATIO;
  }
  const snapped = pickClosestAspectRatio(
    ratioValue,
    FRIENDLY_ASPECT_RATIO_CANDIDATES,
  );
  const snappedValue = parseAspectRatio(snapped);
  const snapDistance = Math.abs(Math.log(snappedValue / ratioValue));
  if (snapDistance <= Math.log(1.04)) return snapped;
  return ratioValue >= 1
    ? `${ratioValue.toFixed(2)}:1`
    : `1:${(1 / ratioValue).toFixed(2)}`;
}

export function resolveStoryboardGenRatioControlMode(
  mode: StoryboardRatioControlMode | undefined,
  showAdvancedControls: boolean,
): StoryboardRatioControlMode {
  if (!showAdvancedControls) return 'cell';
  return mode === 'overall' ? 'overall' : 'cell';
}

export function resolveStoryboardGenControlAspectRatio(
  selectedAspectRatio: string,
  persistedAspectRatio: string | undefined,
): string {
  if (selectedAspectRatio === AUTO_REQUEST_ASPECT_RATIO) {
    return persistedAspectRatio || DEFAULT_ASPECT_RATIO;
  }
  return selectedAspectRatio || DEFAULT_ASPECT_RATIO;
}

export function resolveStoryboardGenAspectRatios(
  mode: StoryboardRatioControlMode,
  controlRatioValue: number,
  rows: number,
  cols: number,
): StoryboardGenResolvedAspectRatios {
  const safeRows = Math.max(1, rows);
  const safeCols = Math.max(1, cols);
  const safeControl =
    Number.isFinite(controlRatioValue) && controlRatioValue > 0
      ? controlRatioValue
      : 1;
  const cellRatioValue =
    mode === 'cell' ? safeControl : safeControl * (safeRows / safeCols);
  const overallRatioValue =
    mode === 'overall' ? safeControl : safeControl * (safeCols / safeRows);

  return {
    cellRatioValue,
    overallRatioValue,
    cellAspectRatio: storyboardRatioValueToAspectRatio(cellRatioValue),
    overallAspectRatio: storyboardRatioValueToAspectRatio(overallRatioValue),
    cellAspectRatioLabel: formatStoryboardAspectRatio(cellRatioValue),
    overallAspectRatioLabel: formatStoryboardAspectRatio(overallRatioValue),
  };
}

function storyboardAspectRatioCss(aspectRatio: string): string {
  const [width = '1', height = '1'] = aspectRatio.split(':');
  return `${width} / ${height}`;
}

export function resolveStoryboardGenLayout({
  rows,
  cols,
  frameAspectRatio,
  showAdvancedControls,
  width,
  height,
}: {
  rows: number;
  cols: number;
  frameAspectRatio: string;
  showAdvancedControls: boolean;
  width?: number;
  height?: number;
}): StoryboardGenLayoutProjection {
  const aspectRatio = Math.max(0.1, parseAspectRatio(frameAspectRatio));
  let baseCellWidth = STORYBOARD_GRID_BASE_CELL_HEIGHT_PX * aspectRatio;
  let baseGridWidth =
    cols * baseCellWidth +
    Math.max(0, cols - 1) * STORYBOARD_GEN_FRAME_GRID_GAP_PX;
  if (baseGridWidth > STORYBOARD_GRID_MAX_WIDTH_PX) {
    const scale = STORYBOARD_GRID_MAX_WIDTH_PX / baseGridWidth;
    baseCellWidth *= scale;
    baseGridWidth =
      cols * baseCellWidth +
      Math.max(0, cols - 1) * STORYBOARD_GEN_FRAME_GRID_GAP_PX;
  }

  const roundedCellWidth = Math.max(
    FRAME_CELL_MIN_WIDTH_PX,
    Math.round(baseCellWidth),
  );
  const roundedCellHeight = Math.max(
    FRAME_CELL_MIN_HEIGHT_PX,
    Math.round(roundedCellWidth / aspectRatio),
  );
  const roundedGridWidth =
    cols * roundedCellWidth +
    Math.max(0, cols - 1) * STORYBOARD_GEN_FRAME_GRID_GAP_PX;
  const roundedGridHeight =
    rows * roundedCellHeight +
    Math.max(0, rows - 1) * STORYBOARD_GEN_FRAME_GRID_GAP_PX;
  const nodeInnerWidth = Math.max(
    STORYBOARD_CONTROL_ROW_WIDTH_PX,
    STORYBOARD_PARAMS_ROW_WIDTH_PX,
    roundedGridWidth,
  );
  const baseWidth = Math.max(
    STORYBOARD_GEN_NODE_SIZE_LIMITS.minWidth,
    Math.round(nodeInnerWidth + STORYBOARD_NODE_HORIZONTAL_PADDING_PX),
  );
  const baseHeight = Math.max(
    STORYBOARD_GEN_NODE_SIZE_LIMITS.minHeight,
    Math.round(
      NODE_VERTICAL_PADDING_PX +
        CONFIG_ROW_HEIGHT_PX +
        CONFIG_ROW_MARGIN_BOTTOM_PX +
        (showAdvancedControls ? ADVANCED_RATIO_INFO_HEIGHT_PX : 0) +
        roundedGridHeight +
        FRAME_GRID_MARGIN_BOTTOM_PX +
        PARAM_ROW_HEIGHT_PX,
    ),
  );
  const resolvedWidth = Math.max(baseWidth, Math.round(width ?? baseWidth));
  const resolvedHeight = Math.max(baseHeight, Math.round(height ?? baseHeight));
  const safeRows = Math.max(1, rows);
  const safeCols = Math.max(1, cols);
  const innerWidth = Math.max(
    120,
    resolvedWidth - STORYBOARD_NODE_HORIZONTAL_PADDING_PX,
  );
  const availableGridHeight = Math.max(
    72,
    resolvedHeight -
      NODE_VERTICAL_PADDING_PX -
      CONFIG_ROW_HEIGHT_PX -
      CONFIG_ROW_MARGIN_BOTTOM_PX -
      (showAdvancedControls ? ADVANCED_RATIO_INFO_HEIGHT_PX : 0) -
      FRAME_GRID_MARGIN_BOTTOM_PX -
      PARAM_ROW_HEIGHT_PX,
  );
  const widthLimitedCellWidth =
    (innerWidth -
      Math.max(0, safeCols - 1) * STORYBOARD_GEN_FRAME_GRID_GAP_PX) /
    safeCols;
  const heightLimitedCellHeight =
    (availableGridHeight -
      Math.max(0, safeRows - 1) * STORYBOARD_GEN_FRAME_GRID_GAP_PX) /
    safeRows;
  const resolvedCellWidth = Math.floor(
    Math.min(widthLimitedCellWidth, heightLimitedCellHeight * aspectRatio),
  );
  const cellWidth = Math.max(FRAME_CELL_MIN_WIDTH_PX, resolvedCellWidth);
  const gridWidth =
    safeCols * cellWidth +
    Math.max(0, safeCols - 1) * STORYBOARD_GEN_FRAME_GRID_GAP_PX;

  return {
    baseSize: { width: baseWidth, height: baseHeight },
    size: { width: resolvedWidth, height: resolvedHeight },
    cellWidth,
    gridWidth,
    paramsRowWidth: Math.max(
      STORYBOARD_PARAMS_ROW_WIDTH_PX,
      Math.floor(innerWidth),
    ),
    cellAspectRatioCss: storyboardAspectRatioCss(frameAspectRatio),
  };
}

export function buildStoryboardFrameDescriptionDrafts(
  frames: readonly StoryboardGenFrameItem[],
): Record<string, string> {
  return Object.fromEntries(
    frames.map((frame) => [frame.id, frame.description]),
  );
}

export function areStoryboardFrameDraftsEqual(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value]) => right[key] === value)
  );
}

export function resizeStoryboardGenFrames(
  frames: readonly StoryboardGenFrameItem[],
  targetCount: number,
  createId: () => string,
): StoryboardGenFrameItem[] {
  const safeTargetCount = Math.max(0, Math.floor(targetCount));
  return Array.from({ length: safeTargetCount }, (_, index) =>
    index < frames.length
      ? frames[index]
      : { id: createId(), description: '', referenceIndex: null },
  );
}

export function resolveStoryboardReferenceIndex(
  description: string,
  maxImageCount: number,
): number | null {
  const reference = findReferenceTokens(description, maxImageCount)[0];
  return reference ? reference.value - 1 : null;
}

export function updateStoryboardGenFrameDescription(
  frames: StoryboardGenFrameItem[],
  index: number,
  description: string,
  maxImageCount: number,
): StoryboardGenFrameItem[] {
  const frame = frames[index];
  if (!frame) return frames;
  const referenceIndex = resolveStoryboardReferenceIndex(
    description,
    maxImageCount,
  );
  if (
    frame.description === description &&
    frame.referenceIndex === referenceIndex
  ) {
    return frames;
  }
  const nextFrames = [...frames];
  nextFrames[index] = { ...frame, description, referenceIndex };
  return nextFrames;
}

export function buildStoryboardGenerationPrompt({
  rows,
  cols,
  frames,
  drafts,
  keepStyleConsistent,
  disableTextInImage,
  autoInferEmptyFrame,
}: {
  rows: number;
  cols: number;
  frames: readonly StoryboardGenFrameItem[];
  drafts: Readonly<Record<string, string>>;
  keepStyleConsistent: boolean;
  disableTextInImage: boolean;
  autoInferEmptyFrame: boolean;
}): string {
  const parts: string[] = [];
  const directives = [
    `生成一张${rows}×${cols}的${rows * cols}宫格多版本候选图，每一格是独立候选画面`,
  ];
  if (keepStyleConsistent) directives.push('图片风格与参考图保持一致');
  if (disableTextInImage) directives.push('禁止添加描述文本');
  parts.push(`${directives.join('，')}。`);

  frames.forEach((frame, index) => {
    const description = drafts[frame.id] ?? frame.description;
    const sanitizedDescription = sanitizeStoryboardPromptText(description);
    if (sanitizedDescription) {
      parts.push(`候选${index + 1}：${sanitizedDescription}`);
    } else if (autoInferEmptyFrame) {
      parts.push(`候选${index + 1}：依据之前的内容进行推测`);
    }
  });
  return parts.join('\n');
}

export function resolveStoryboardGenerationFrameNotes({
  frames,
  drafts,
  frameCount,
  ignoreAtTag,
}: {
  frames: readonly StoryboardGenFrameItem[];
  drafts: Readonly<Record<string, string>>;
  frameCount: number;
  ignoreAtTag: boolean;
}): string[] {
  return frames.slice(0, frameCount).map((frame) =>
    sanitizeStoryboardText(
      drafts[frame.id] ?? frame.description,
      ignoreAtTag,
    ),
  );
}

export function resolveStoryboardGridCount(
  current: number,
  delta: number,
): number {
  return Math.max(1, Math.min(9, current + delta));
}

export function resolveAutoStoryboardRequestAspectRatio({
  mode,
  detectedControlRatio,
  rows,
  cols,
  supportedAspectRatios,
}: {
  mode: StoryboardRatioControlMode;
  detectedControlRatio: number;
  rows: number;
  cols: number;
  supportedAspectRatios: readonly string[];
}): string {
  const ratios = resolveStoryboardGenAspectRatios(
    mode,
    detectedControlRatio,
    rows,
    cols,
  );
  return pickClosestAspectRatio(
    ratios.overallRatioValue,
    [...supportedAspectRatios],
  );
}
