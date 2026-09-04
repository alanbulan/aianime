// Copyright (c) 2026 AI anime
import {
  pickCanvasImageTo3dResultUrl,
  pickStrictCanvasImageTo3dResultUrl,
} from './imageTo3d';

export interface CanvasGenerationHistoryRecord {
  readonly schema_version: number;
  readonly canvas_id: string;
  readonly node_id: string;
  readonly recorded_at: string;
  readonly id: string;
  readonly task_type: string;
  readonly task_key: string;
  readonly job_id: string;
  readonly status: string;
  readonly media_type: string;
  readonly result: Record<string, unknown>;
  readonly model?: string;
  readonly gen_mode?: string;
}

export interface GenerationHistoryRecordProjection {
  readonly result?: Record<string, unknown> | null;
  readonly status?: string;
}

export function historyRecordOutputUrl(
  record: GenerationHistoryRecordProjection,
): string | null {
  const result = record.result ?? {};
  for (const key of [
    'output_url',
    'image_url',
    'video_url',
    'audio_url',
    'ply_url',
    'master_url',
    'url',
  ]) {
    const value = result[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

export function historyRecordWorldUrl(
  record: GenerationHistoryRecordProjection,
): string | null {
  return (
    pickCanvasImageTo3dResultUrl(record.result)
    ?? historyRecordOutputUrl(record)
  );
}

export function historyRecordStrictWorldUrl(
  record: GenerationHistoryRecordProjection,
): string | null {
  return pickStrictCanvasImageTo3dResultUrl(record.result);
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|avif|gif|bmp|tiff?)(\?|#|$)/i;
const INPUT_IMAGE_KEYS = [
  'source_url',
  'sourceUrl',
  'source_image_url',
  'sourceImageUrl',
  'input_image_url',
  'inputImageUrl',
  'image_url',
  'imageUrl',
  'master_url',
  'masterUrl',
  'pano_url',
  'panoUrl',
  'url',
];
const INPUT_CONTAINER_KEYS = [
  'input',
  'inputs',
  'params',
  'parameters',
  'request',
  'payload',
  'meta',
  'metadata',
];

export function historyRecordInputImageUrl(
  record: GenerationHistoryRecordProjection,
): string | null {
  const result = record.result ?? {};
  const pickImage = (scope: unknown): string | null => {
    if (!scope || typeof scope !== 'object') return null;
    const object = scope as Record<string, unknown>;
    for (const key of INPUT_IMAGE_KEYS) {
      const value = object[key];
      if (typeof value === 'string' && IMAGE_EXT_RE.test(value)) return value;
    }
    return null;
  };
  const direct = pickImage(result);
  if (direct) return direct;
  for (const key of INPUT_CONTAINER_KEYS) {
    const nested = pickImage(result[key]);
    if (nested) return nested;
  }
  return null;
}

export function historyRecordPreviewImageUrl(
  record: GenerationHistoryRecordProjection,
): string | null {
  const result = record.result ?? {};
  for (const key of [
    'preview_image_url',
    'previewImageUrl',
    'preview_url',
    'previewUrl',
    'cover_url',
    'coverUrl',
    'thumbnail_url',
    'thumbnailUrl',
    'source_image_url',
    'sourceImageUrl',
  ]) {
    const value = result[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return historyRecordInputImageUrl(record);
}

const PROMPT_KEYS = [
  'prompt',
  'composed_prompt',
  'composedPrompt',
  'translated_text',
  'positive_prompt',
  'user_prompt',
  'input_prompt',
  'text',
  'reverse_prompt',
];
const PROMPT_CONTAINER_KEYS = [
  'input',
  'inputs',
  'params',
  'parameters',
  'request',
  'payload',
  'meta',
  'metadata',
];

function pickPromptString(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const object = value as Record<string, unknown>;
  for (const key of PROMPT_KEYS) {
    const prompt = object[key];
    if (typeof prompt === 'string' && prompt.trim().length > 0) return prompt;
  }
  return null;
}

export function historyRecordPrompt(
  record: GenerationHistoryRecordProjection,
): string | null {
  const result = record.result ?? {};
  const top = record as unknown as Record<string, unknown>;
  for (const scope of [result, top]) {
    const direct = pickPromptString(scope);
    if (direct) return direct;
    for (const key of PROMPT_CONTAINER_KEYS) {
      const nested = pickPromptString(scope[key]);
      if (nested) return nested;
    }
  }
  return null;
}

export function isCompletedHistoryRecord(
  record: GenerationHistoryRecordProjection,
): boolean {
  return record.status === 'completed' || record.status === 'succeeded';
}

export function hasCompletedHistoryRecords(
  records: readonly GenerationHistoryRecordProjection[],
): boolean {
  return records.some(isCompletedHistoryRecord);
}
