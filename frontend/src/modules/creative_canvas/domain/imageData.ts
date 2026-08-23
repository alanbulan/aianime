// Copyright (c) 2026 AI anime
import {
  MEDIA_VARIANT_MAX_EDGE,
  pickMediaVariant,
  withMediaVariant,
} from '@/lib/media-url';

import { parseAspectRatio } from './aspectRatio';

// 从一组候选比例（"w:h" 字符串）里挑数值上最接近 targetRatio 的那个。用比值的
// 对数距离，横/竖比例对称（2.33 与其倒数 0.43 到 1 的距离一致）。候选为空时回退 '1:1'。
export function pickClosestAspectRatio(
  targetRatio: number,
  supportedAspectRatios: string[],
): string {
  const supported = supportedAspectRatios.length > 0 ? supportedAspectRatios : ['1:1'];
  let bestValue = supported[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const aspectRatio of supported) {
    const ratio = parseAspectRatio(aspectRatio);
    const distance = Math.abs(Math.log(ratio / targetRatio));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestValue = aspectRatio;
    }
  }

  return bestValue;
}

// Aspect ratios the backend accepts for generation. The canvas may carry raw
// pixel-derived ratios (e.g. "43:24" from `reduceAspectRatio`) or "auto"; every
// generation request must snap to one of these before sending. Image and video
// pipelines accept different sets.
export const IMAGE_GENERATION_ASPECT_RATIOS = [
  '1:1',
  '9:16',
  '16:9',
  '3:4',
  '4:3',
  '3:2',
  '2:3',
  '4:5',
  '5:4',
  // 后端 FREEZONE_PRESET_IMAGE_ASPECT_RATIOS 支持 21:9，节点下拉也提供该选项；
  // 若这里缺失，提交时 snap 会把用户选的 21:9 错吸附成最接近的 16:9（issue #52）。
  '21:9',
  '9:21',
  '5:4',
  '4:5',
] as const;

export const VIDEO_GENERATION_ASPECT_RATIOS = [
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  '21:9',
] as const;

// Snap any ratio string (incl. raw pixel ratios) to the numerically closest
// allowed value. Non-ratio inputs ("auto" / "" / garbage) resolve to `fallback`.
export function snapToAllowedAspectRatio(
  value: string,
  allowed: readonly string[],
  fallback: string,
): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed.includes(':')) return fallback;
  const candidates = allowed.length > 0 ? [...allowed] : [fallback];
  return pickClosestAspectRatio(parseAspectRatio(trimmed), candidates);
}

export function reduceAspectRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) {
    return '1:1';
  }

  const gcd = greatestCommonDivisor(Math.round(width), Math.round(height));
  return `${Math.round(width / gcd)}:${Math.round(height / gcd)}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);

  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }

  return x || 1;
}

const LOCAL_PATH_PREFIX_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/;

const ORIGINAL_IMAGE_ZOOM_THRESHOLD = 1.45;

export function shouldUseOriginalImageByZoom(zoom: number): boolean {
  return Number.isFinite(zoom) && zoom >= ORIGINAL_IMAGE_ZOOM_THRESHOLD;
}

export const NODE_BODY_VARIANT_MAX_EDGE = MEDIA_VARIANT_MAX_EDGE.card;

export function nodeBodyRequiredEdge(
  display: { width: number; height: number },
  zoom: number,
  devicePixelRatio: number,
): number {
  const edge = Math.max(display.width, display.height);
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const dpr =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  return Math.ceil(edge * scale * dpr);
}

export type ImagePixelSize = { width: number; height: number };

export type NodeBodyImage = {
  src: string;
  original: string;
  downscaled: boolean;
  maxEdge: number | null;
};

export function readNodeNaturalSize(data: unknown): ImagePixelSize | null {
  if (!data || typeof data !== 'object') return null;
  const { imageNaturalWidth: width, imageNaturalHeight: height } = data as {
    imageNaturalWidth?: unknown;
    imageNaturalHeight?: unknown;
  };
  return (
    typeof width === 'number' &&
    typeof height === 'number' &&
    width > 0 &&
    height > 0
  )
    ? { width, height }
    : null;
}

export function nodeBodyImageSrc(
  url: string,
  natural: ImagePixelSize | null,
  options?: { preferOriginal?: boolean; requiredEdge?: number },
): NodeBodyImage {
  const original: NodeBodyImage = {
    src: url,
    original: url,
    downscaled: false,
    maxEdge: null,
  };
  if (options?.preferOriginal || !natural) return original;
  const variant = pickMediaVariant(
    options?.requiredEdge ?? NODE_BODY_VARIANT_MAX_EDGE,
  );
  if (variant === null) return original;
  const maxEdge = MEDIA_VARIANT_MAX_EDGE[variant];
  if (Math.max(natural.width, natural.height) <= maxEdge) return original;
  const src = withMediaVariant(url, variant);
  return src === url
    ? original
    : { src, original: url, downscaled: true, maxEdge };
}

export function nodeBodyRecordDescribesImage(
  image: { naturalWidth: number; naturalHeight: number },
  natural: ImagePixelSize | null,
  maxEdge: number,
): boolean {
  if (!natural) return false;
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!(width > 0) || !(height > 0)) return false;
  if (width >= height !== natural.width >= natural.height) return false;
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const recordedLongEdge = Math.max(natural.width, natural.height);
  const recordedShortEdge = Math.min(natural.width, natural.height);
  if (longEdge === recordedLongEdge && shortEdge === recordedShortEdge) {
    return true;
  }
  if (longEdge !== maxEdge) return false;
  return Math.abs(
    shortEdge - Math.round((longEdge * recordedShortEdge) / recordedLongEdge),
  ) <= 1;
}

export function nodeBodyImageMeasurement(
  image: { naturalWidth: number; naturalHeight: number },
  body: NodeBodyImage,
  natural: ImagePixelSize | null,
): ImagePixelSize {
  if (
    body.downscaled &&
    natural &&
    nodeBodyRecordDescribesImage(image, natural, body.maxEdge ?? 0)
  ) {
    return natural;
  }
  return { width: image.naturalWidth, height: image.naturalHeight };
}

export type NaturalSizeRecordWrite = {
  persist: boolean;
  recordHistory: boolean;
  applySize: boolean;
};

export function planNaturalSizeRecordWrite(input: {
  aspectRatioChanged: boolean;
  displaySizeMismatch: boolean;
  record: ImagePixelSize | null;
  measured: ImagePixelSize;
  measuringRecordSubject: boolean;
  sizeLockedByUser: boolean;
}): NaturalSizeRecordWrite {
  const recordIsWrong = input.measuringRecordSubject && (
    input.record === null ||
    input.record.width !== input.measured.width ||
    input.record.height !== input.measured.height
  );
  if (input.sizeLockedByUser) {
    return { persist: recordIsWrong, recordHistory: false, applySize: false };
  }
  if (input.aspectRatioChanged || input.displaySizeMismatch) {
    return { persist: true, recordHistory: true, applySize: true };
  }
  return { persist: recordIsWrong, recordHistory: false, applySize: false };
}

export function isLikelyLocalImagePath(imageUrl: string): boolean {
  if (!imageUrl) {
    return false;
  }

  const lower = imageUrl.toLowerCase();
  if (
    lower.startsWith('data:') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('blob:') ||
    lower.startsWith('asset:') ||
    lower.startsWith('file://')
  ) {
    return false;
  }

  return LOCAL_PATH_PREFIX_PATTERN.test(imageUrl);
}

export function resolveImageDisplayUrl(imageUrl: string): string {
  return imageUrl;
}

// 判断字符串是否是可作为 <img src> 渲染的真实图片来源（协议 URL 或本地图片路径）。
// 脚本表格的「角色图/参考」是后端占位字符串字段，模型常填入 `无` 之类的非 URL 文本，
// 直接塞进 <img> 会 404 变成裂图；渲染前用它过滤。
export function isRenderableImageSrc(value: string): boolean {
  if (!value) {
    return false;
  }
  const lower = value.toLowerCase();
  if (
    lower.startsWith('data:') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('blob:') ||
    lower.startsWith('asset:') ||
    lower.startsWith('file://')
  ) {
    return true;
  }
  return isLikelyLocalImagePath(value);
}

export function extractBase64Payload(dataUrl: string): string {
  const [, payload = ''] = dataUrl.split(',');
  return payload;
}
