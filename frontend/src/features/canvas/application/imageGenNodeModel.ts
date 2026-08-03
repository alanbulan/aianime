// Copyright (c) 2026 AI anime
import {
  parseAspectRatio,
  IMAGE_GENERATION_ASPECT_RATIOS,
  pickClosestAspectRatio,
  resolveImageDisplayUrl,
  snapToAllowedAspectRatio,
} from '@/modules/creative_canvas/public';
import type {
  ImageGenCameraSelection,
  ImageGenCount,
  ImageGenNodeData,
  ImageQuality,
  ImageSize,
} from '@/features/canvas/domain/canvasNodes';

export const IMAGE_GEN_NODE_DEFAULT_WIDTH = 580;
export const IMAGE_GEN_NODE_DEFAULT_HEIGHT = 360;
export const IMAGE_GEN_NODE_MIN_WIDTH = 480;
export const IMAGE_GEN_NODE_MIN_HEIGHT = 260;
export const IMAGE_GEN_NODE_MAX_WIDTH = 1100;
export const IMAGE_GEN_NODE_MAX_HEIGHT = 1000;

export const IMAGE_GEN_OPERATIONS_PANEL_HEIGHT = 232;
export const IMAGE_GEN_OPERATIONS_PANEL_GAP = 12;
export const IMAGE_GEN_OPERATIONS_PANEL_MIN_WIDTH = 720;
export const IMAGE_GEN_OPERATIONS_PANEL_EXPANDED_HEIGHT = 560;
export const IMAGE_GEN_OPERATIONS_PANEL_EXPANDED_MIN_WIDTH = 960;

export const IMAGE_GEN_ASPECT_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: 'auto', label: '自适应' },
  { value: '1:1', label: '1:1' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
  { value: '21:9', label: '21:9' },
];

export const IMAGE_GEN_SIZE_OPTIONS: ReadonlyArray<ImageSize> = [
  '1K',
  '2K',
  '4K',
];
export const IMAGE_GEN_COUNT_OPTIONS: ReadonlyArray<ImageGenCount> = [1, 2, 4];
export const IMAGE_GEN_SELECTED_BACKGROUND_CROP_ASPECT_OPTIONS = [
  '2:3',
  '16:9',
] as const;
export const IMAGE_GEN_QUALITY_OPTIONS: ReadonlyArray<{
  value: ImageQuality;
  label: string;
}> = [
  { value: 'low', label: '低画质' },
  { value: 'medium', label: '标准画质' },
  { value: 'high', label: '高画质' },
];
export const IMAGE_GEN_DEFAULT_QUALITY: ImageQuality = 'medium';

export interface ImageGenModelOption {
  id: string;
  apiModel?: string | null;
}

export interface ImageGenReferencePreviewPosition {
  left: number;
  top: number;
  size: number;
}

export interface ImageGenReferencePreviewRect {
  left: number;
  top: number;
}

export function isImage2Model(apiModel: string | null | undefined): boolean {
  return /image[-_]?2/i.test(apiModel ?? '');
}

export function resolveImageGenModel<T extends ImageGenModelOption>(
  availableModels: readonly T[],
  persistedModel: unknown,
): T | undefined {
  const persisted =
    typeof persistedModel === 'string' && persistedModel.length > 0
      ? persistedModel
      : null;
  return (
    (persisted
      ? availableModels.find((model) => model.id === persisted)
      : undefined) ?? availableModels[0]
  );
}

export function resolveImageGenNodeDimensions(
  width: number | undefined,
  height: number | undefined,
): { width: number; height: number } {
  return {
    width: Math.max(
      IMAGE_GEN_NODE_MIN_WIDTH,
      Math.round(width ?? IMAGE_GEN_NODE_DEFAULT_WIDTH),
    ),
    height: Math.max(
      IMAGE_GEN_NODE_MIN_HEIGHT,
      Math.round(height ?? IMAGE_GEN_NODE_DEFAULT_HEIGHT),
    ),
  };
}

export function resolveImageGenPreviewUrl(
  data: ImageGenNodeData,
  referenceImageUrl: string | null,
): string | null {
  if (data.previewImageUrl) return resolveImageDisplayUrl(data.previewImageUrl);
  if (data.imageUrl) return resolveImageDisplayUrl(data.imageUrl);
  return referenceImageUrl ? resolveImageDisplayUrl(referenceImageUrl) : null;
}

export function imageGenAlbumUrls(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (url): url is string => typeof url === 'string' && url.length > 0,
      )
    : [];
}

export function resolveImageGenNaturalSize(data: ImageGenNodeData): {
  width: number;
  height: number;
} | null {
  const width = (data as { imageNaturalWidth?: unknown }).imageNaturalWidth;
  const height = (data as { imageNaturalHeight?: unknown }).imageNaturalHeight;
  return (
    typeof width === 'number' &&
    typeof height === 'number' &&
    width > 0 &&
    height > 0
  )
    ? { width, height }
    : null;
}

export function resolveImageGenReferencePreviewPosition(
  rect: ImageGenReferencePreviewRect | null,
  viewportWidth: number,
): ImageGenReferencePreviewPosition | null {
  if (!rect) return null;
  const size = 220;
  return {
    left: Math.min(Math.max(8, rect.left), viewportWidth - size - 8),
    top: Math.max(8, rect.top - size - 8),
    size,
  };
}

export function hasImageGenCameraSelection(
  selection: ImageGenCameraSelection | null,
): boolean {
  return Boolean(
    selection &&
      (selection.cameraBodyId ||
        selection.lensId ||
        selection.focalLengthMm ||
        selection.aperture),
  );
}

export function resolveImageGenEffectivePrompt(input: {
  prompt: string;
  upstreamText: string;
  inlineUpstreamText: boolean;
  hasUserEditedPrompt: boolean;
}): string {
  const ownPrompt = input.prompt.trim();
  const upstreamText = input.upstreamText.trim();
  if (input.inlineUpstreamText) {
    return ownPrompt || (input.hasUserEditedPrompt ? '' : upstreamText);
  }
  return [upstreamText, ownPrompt].filter(Boolean).join('\n\n');
}

export function hasEffectiveImageGenPrompt(input: {
  prompt: string;
  upstreamText: string;
  inlineUpstreamText: boolean;
  hasUserEditedPrompt: boolean;
}): boolean {
  return resolveImageGenEffectivePrompt(input).length > 0;
}

export function snapImageGenAspectRatio(aspectRatio: string): string {
  return snapToAllowedAspectRatio(
    aspectRatio,
    IMAGE_GENERATION_ASPECT_RATIOS,
    '1:1',
  );
}

export function resolveNearestImageGenAspectOption(aspectRatio: string): {
  value: string;
  label: string;
} {
  const exact = IMAGE_GEN_ASPECT_OPTIONS.find(
    (option) => option.value === aspectRatio,
  );
  if (exact) return exact;
  const candidates = IMAGE_GEN_ASPECT_OPTIONS.filter(
    (option) => option.value !== 'auto',
  );
  const nearestValue = pickClosestAspectRatio(
    parseAspectRatio(aspectRatio),
    candidates.map((option) => option.value),
  );
  return (
    candidates.find((option) => option.value === nearestValue) ?? {
      value: aspectRatio,
      label: aspectRatio,
    }
  );
}
