// Copyright (c) 2026 AI anime
import type { ImageEditNodeData } from '@/features/canvas/domain/canvasNodes';
import {
  coercePushTarget,
  findReferenceTokens,
  type CanvasAssetLibrarySelection,
  type GenerationCapability,
} from '@/modules/creative_canvas/public';

export interface ImageEditAspectRatioChoice {
  value: string;
  label: string;
}

export interface ImageEditPromptSegment {
  kind: 'text' | 'reference';
  text: string;
  start: number;
}

export interface ImageEditGenerationModeChoice {
  key: string;
  label: string;
  disabled: boolean;
}

export interface ImageEditSourceMeta {
  kind?: string;
  role?: string;
  label?: string;
  rel_path?: string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ImageEditAssetReferencePlan {
  selection: CanvasAssetLibrarySelection;
  position: { x: number; y: number };
}

export const IMAGE_EDIT_NODE_SIZE_LIMITS = {
  minWidth: 520,
  minHeight: 420,
  maxWidth: 1400,
  maxHeight: 1000,
  defaultWidth: 640,
  defaultHeight: 520,
} as const;

const IMAGE_EDIT_UPLOAD_NODE_WIDTH = 320;
const IMAGE_EDIT_UPLOAD_NODE_HEIGHT = 240;
const IMAGE_EDIT_UPLOAD_GAP_X = 40;
const IMAGE_EDIT_UPLOAD_GAP_Y = 24;

const IMAGE_EDIT_GENERATION_MODE_DEFINITIONS = [
  { key: 'text_to_image', label: '文生图' },
  { key: 'all_reference', label: '全能参考' },
  { key: 'image_reference', label: '图片参考' },
  { key: 'image_to_image', label: '图生图' },
  { key: 'image_to_video', label: '图生视频', unavailable: true },
  { key: 'first_last_frame', label: '首尾帧', unavailable: true },
] as const;

export function resolveImageEditNodeSize(
  width: number | undefined,
  height: number | undefined,
): { width: number; height: number } {
  return {
    width: Math.max(
      IMAGE_EDIT_NODE_SIZE_LIMITS.minWidth,
      Math.round(width ?? IMAGE_EDIT_NODE_SIZE_LIMITS.defaultWidth),
    ),
    height: Math.max(
      IMAGE_EDIT_NODE_SIZE_LIMITS.minHeight,
      Math.round(height ?? IMAGE_EDIT_NODE_SIZE_LIMITS.defaultHeight),
    ),
  };
}

export function resolveImageEditGenerationMode(
  generationMode: ImageEditNodeData['generationMode'],
  referenceImageCount: number,
): NonNullable<ImageEditNodeData['generationMode']> {
  return generationMode ??
    (referenceImageCount > 0 ? 'all_reference' : 'text_to_image');
}

export function projectImageEditGenerationModeChoices(
  referenceImageCount: number,
): ImageEditGenerationModeChoice[] {
  return IMAGE_EDIT_GENERATION_MODE_DEFINITIONS.map((choice) => ({
    key: choice.key,
    label: choice.label,
    disabled:
      ('unavailable' in choice && choice.unavailable) ||
      (choice.key === 'text_to_image' && referenceImageCount > 0),
  }));
}

export function projectImageEditPromptSegments(
  prompt: string,
  maxImageCount: number,
): ImageEditPromptSegment[] {
  if (!prompt) {
    return [{ kind: 'text', text: ' ', start: 0 }];
  }

  const segments: ImageEditPromptSegment[] = [];
  let lastIndex = 0;
  for (const token of findReferenceTokens(prompt, maxImageCount)) {
    if (token.start > lastIndex) {
      segments.push({
        kind: 'text',
        text: prompt.slice(lastIndex, token.start),
        start: lastIndex,
      });
    }
    segments.push({
      kind: 'reference',
      text: token.token,
      start: token.start,
    });
    lastIndex = token.end;
  }

  if (lastIndex < prompt.length) {
    segments.push({
      kind: 'text',
      text: prompt.slice(lastIndex),
      start: lastIndex,
    });
  }
  return segments;
}

export function buildImageEditGenerationPrompt(
  promptDraft: string,
  upstreamText: string,
): string {
  const ownPrompt = promptDraft.replace(/@(?=图\d+)/g, '').trim();
  return [upstreamText, ownPrompt]
    .filter((value) => value.length > 0)
    .join('\n\n');
}

export function buildImageEditResultNodeTitle(
  prompt: string,
  fallbackTitle: string,
): string {
  return prompt.trim() || fallbackTitle;
}

export function mergeImageEditReferenceUrls(
  incomingImages: readonly string[],
  upstreamReferenceUrls: readonly string[],
): string[] {
  return Array.from(new Set([...incomingImages, ...upstreamReferenceUrls]));
}

export function collectImageEditInputSourceMeta(
  nodeId: string,
  nodes: ReadonlyArray<{ id: string; data?: unknown }>,
  edges: ReadonlyArray<{ source: string; target: string }>,
): ImageEditSourceMeta | null {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sourceIds = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => edge.source);
  for (const sourceId of sourceIds) {
    const sourceNode = nodeById.get(sourceId);
    const data = sourceNode?.data as Record<string, unknown> | undefined;
    const source = data?.__freezone_source as ImageEditSourceMeta | undefined;
    if (source?.kind) return source;
  }
  return null;
}

export function collectImageEditInputSlotTarget(
  nodeId: string,
  nodes: ReadonlyArray<{ id: string; data?: unknown }>,
  edges: ReadonlyArray<{ source: string; target: string }>,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sourceIds = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => edge.source);
  for (const sourceId of sourceIds) {
    const sourceNode = nodeById.get(sourceId);
    const data = sourceNode?.data as Record<string, unknown> | undefined;
    const slotTarget = coercePushTarget(data?.slot_target);
    if (slotTarget) return slotTarget;
    const source = data?.__freezone_source as ImageEditSourceMeta | undefined;
    const sourceSlotTarget = coercePushTarget(source?.slot_target);
    if (sourceSlotTarget) return sourceSlotTarget;
  }
  return null;
}

export function mergeImageEditCandidateSourceMeta(
  origin: ImageEditSourceMeta | null,
  capability: Pick<GenerationCapability, 'id' | 'outputKind'> | null,
  capabilityDefaultTarget: Record<string, unknown> | undefined,
  capabilityOutputKind: string | undefined,
): ImageEditSourceMeta {
  const baseMeta =
    origin && typeof origin.meta === 'object' && origin.meta
      ? { ...origin.meta }
      : {};
  const capabilityMeta =
    typeof capabilityDefaultTarget === 'object' && capabilityDefaultTarget
      ? capabilityDefaultTarget
      : {};

  if (capability) {
    return {
      kind: capabilityOutputKind ?? capability.outputKind,
      role: 'candidate',
      label: origin?.label,
      meta: {
        ...baseMeta,
        ...capabilityMeta,
        capability_id: capability.id,
        output_kind: capabilityOutputKind ?? capability.outputKind,
        origin: origin ?? null,
      },
    };
  }

  if (origin?.kind) {
    return {
      ...origin,
      role: 'candidate',
      meta: { ...baseMeta, origin },
    };
  }

  return { kind: 'generic', role: 'candidate', meta: {} };
}

export function planImageEditAssetReferences({
  selections,
  nodePosition,
  nodeHeight,
}: {
  selections: ReadonlyArray<CanvasAssetLibrarySelection>;
  nodePosition: { x: number; y: number };
  nodeHeight: number | undefined;
}): ImageEditAssetReferencePlan[] {
  const imageSelections = selections.filter(
    (selection) => selection.media === 'image',
  );
  if (imageSelections.length === 0) return [];

  const baseX =
    nodePosition.x - IMAGE_EDIT_UPLOAD_NODE_WIDTH - IMAGE_EDIT_UPLOAD_GAP_X;
  const totalHeight =
    IMAGE_EDIT_UPLOAD_NODE_HEIGHT * imageSelections.length +
    IMAGE_EDIT_UPLOAD_GAP_Y * (imageSelections.length - 1);
  const startY =
    nodePosition.y +
    ((nodeHeight ?? IMAGE_EDIT_NODE_SIZE_LIMITS.defaultHeight) - totalHeight) /
      2;
  return imageSelections.map((selection, index) => ({
    selection,
    position: {
      x: baseX,
      y:
        startY +
        index * (IMAGE_EDIT_UPLOAD_NODE_HEIGHT + IMAGE_EDIT_UPLOAD_GAP_Y),
    },
  }));
}
