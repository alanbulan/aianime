// Copyright (c) 2026 AI anime
export type TextNodeMode =
  | 'writing'
  | 'textToVideo'
  | 'imageToPrompt'
  // Historical name for cloned speech audio.
  | 'textToMusic'
  // Text-to-music mode that creates a downstream music audio node.
  | 'textToMusicGen';

const REAL_TEXT_ANNOTATION_MODES = new Set<TextNodeMode>([
  'writing',
  'textToVideo',
  'imageToPrompt',
  'textToMusic',
  'textToMusicGen',
]);

const COMPACT_TEXT_ANNOTATION_MODES = new Set<TextNodeMode>([
  'textToVideo',
  'imageToPrompt',
]);

export const TEXT_ANNOTATION_IMAGE_TO_PROMPT_DEFAULT_CONTENT =
  '根据图片生成结构化中文提示词，包括主体描述、环境、光影、镜头语言、风格关键词。';

export const TEXT_ANNOTATION_MUSIC_DEFAULT_CONTENT =
  '生成一首现代品牌电子音乐（约 110 BPM），干净有力的低频贝斯，清晰电子鼓点，整体风格高级、未来感强。开场节奏型贝斯与简洁合成器音色建立律动。主段加入稳定鼓点，节奏清晰，保持克制的张力。强化段加入更丰富的音层，合成器音色提升，律动增强但不过度拥挤。结尾鼓点减弱，仅保留低频与氛围音渐出，干净利落收尾。';

export const TEXT_ANNOTATION_REVERSE_PROMPT_DURATION_MS = 15000;

export const TEXT_ANNOTATION_NODE_SIZE = {
  defaultWidth: 440,
  defaultHeight: 220,
  compactDefaultHeight: 320,
  minWidth: 380,
  minHeight: 240,
  compactMinHeight: 240,
  maxWidth: 900,
  maxHeight: 1200,
} as const;

export function resolveTextAnnotationMode(value: unknown): TextNodeMode {
  return typeof value === 'string'
    && REAL_TEXT_ANNOTATION_MODES.has(value as TextNodeMode)
    ? (value as TextNodeMode)
    : 'writing';
}

export function isCompactTextAnnotationView(
  mode: TextNodeMode,
  referenceOnly: boolean,
): boolean {
  return referenceOnly || COMPACT_TEXT_ANNOTATION_MODES.has(mode);
}

export function resolveTextAnnotationNodeSize({
  width,
  height,
  compact,
}: {
  width?: number | null;
  height?: number | null;
  compact: boolean;
}) {
  const minHeight = compact
    ? TEXT_ANNOTATION_NODE_SIZE.compactMinHeight
    : TEXT_ANNOTATION_NODE_SIZE.minHeight;
  const defaultHeight = compact
    ? TEXT_ANNOTATION_NODE_SIZE.compactDefaultHeight
    : TEXT_ANNOTATION_NODE_SIZE.defaultHeight;
  return {
    width: Math.max(
      TEXT_ANNOTATION_NODE_SIZE.minWidth,
      Math.round(width ?? TEXT_ANNOTATION_NODE_SIZE.defaultWidth),
    ),
    height: Math.max(minHeight, Math.round(height ?? defaultHeight)),
    minWidth: TEXT_ANNOTATION_NODE_SIZE.minWidth,
    minHeight,
    maxWidth: TEXT_ANNOTATION_NODE_SIZE.maxWidth,
    maxHeight: TEXT_ANNOTATION_NODE_SIZE.maxHeight,
  };
}

export function resolveTextAnnotationUpstreamImageUrl(
  data: unknown,
): string | null {
  const record = data as
    | {
        imageUrl?: unknown;
        previewImageUrl?: unknown;
        referenceImageUrl?: unknown;
      }
    | undefined;
  for (const candidate of [
    record?.imageUrl,
    record?.previewImageUrl,
    record?.referenceImageUrl,
  ]) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

export function hasTextAnnotationUserContent(
  content: string,
  placeholder: string,
): boolean {
  const trimmed = content.trim();
  return trimmed.length > 0 && trimmed !== placeholder.trim();
}
