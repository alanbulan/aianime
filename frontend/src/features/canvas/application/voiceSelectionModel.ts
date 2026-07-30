// Copyright (c) 2026 AI anime
import {
  audioVoiceRefKey,
  describeAudioVoiceRef,
  type CanvasAudioReference,
} from '@/features/canvas/application/audioVoiceCatalog';
import type { AudioVoiceRef } from '@/features/canvas/domain/canvasNodes';

export const VOICE_SELECTION_PAGE_SIZE = 20;
export const MAX_VOICE_CLONE_FILE_BYTES = 5_242_880;
export const MAX_VOICE_CLONE_FILE_MB = 5;

export const VOICE_CLONE_AUDIO_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.webm',
] as const;

export const VOICE_CLONE_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
] as const;

export const VOICE_CLONE_FILE_ACCEPT = [
  ...VOICE_CLONE_AUDIO_MIME_TYPES,
  ...VOICE_CLONE_AUDIO_EXTENSIONS,
].join(',');

export type VoiceSelectionTab = 'library' | 'mine';

export interface VoicePickResult {
  ref: AudioVoiceRef;
  label: string;
  language?: string;
}

export interface VoiceSelectionPage {
  items: CanvasAudioReference[];
  total: number;
  totalPages: number;
  page: number;
  pages: Array<number | 'ellipsis'>;
}

export interface VoiceSelectionRow {
  key: string;
  title: string;
  language: string | null;
  gender: string | null;
  isActive: boolean;
  pick: VoicePickResult;
}

export interface VoiceCloneFileInfo {
  name: string;
  type: string;
  size: number;
}

export function voiceCloneFileValidationError(
  file: VoiceCloneFileInfo,
): string | null {
  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = VOICE_CLONE_AUDIO_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );
  if (!hasAllowedExtension || file.type.startsWith('video/')) {
    return '请选择音频文件（mp3 / wav / m4a / aac / ogg / webm）';
  }
  if (file.size > MAX_VOICE_CLONE_FILE_BYTES) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    return `参考音频不能超过 ${MAX_VOICE_CLONE_FILE_MB}MB（当前 ${sizeMb}MB），请压缩或裁剪后重试`;
  }
  return null;
}

export function voiceCloneFileStem(fileName: string): string | undefined {
  const stem = fileName.replace(/\.[^/.]+$/, '');
  return stem || undefined;
}

export function voiceCloneUploadError(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  return /network error/i.test(raw)
    ? `上传失败：网络中断（音频过大可能被中途断开，请确认不超过 ${MAX_VOICE_CLONE_FILE_MB}MB 后重试）`
    : raw || '上传失败';
}

export function customVoiceReferences(
  items: readonly CanvasAudioReference[],
): CanvasAudioReference[] {
  return items.filter((item) => item.ref.scope === 'user_custom');
}

export function filterLibraryVoiceReferences(
  items: readonly CanvasAudioReference[],
  query: string,
): CanvasAudioReference[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [...items];
  return items.filter((item) =>
    [
      item.label ?? '',
      item.ref.characterName ?? '',
      item.ref.identityId ?? '',
      item.ref.slot ?? '',
      item.language ?? '',
    ].some((value) => String(value).toLowerCase().includes(normalizedQuery)),
  );
}

export function filterCustomVoiceReferences(
  items: readonly CanvasAudioReference[],
  query: string,
): CanvasAudioReference[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [...items];
  return items.filter((item) =>
    [item.label ?? '', item.ref.voiceId ?? '', item.language ?? ''].some(
      (value) => String(value).toLowerCase().includes(normalizedQuery),
    ),
  );
}

export function voicePaginationWindow(
  page: number,
  totalPages: number,
): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) pages.push('ellipsis');
  for (let current = start; current <= end; current += 1) {
    pages.push(current);
  }
  if (end < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

export function paginateVoiceReferences(
  items: readonly CanvasAudioReference[],
  page: number,
): VoiceSelectionPage {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / VOICE_SELECTION_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  return {
    items: items.slice(
      (safePage - 1) * VOICE_SELECTION_PAGE_SIZE,
      safePage * VOICE_SELECTION_PAGE_SIZE,
    ),
    total,
    totalPages,
    page: safePage,
    pages: voicePaginationWindow(safePage, totalPages),
  };
}

export function sanitizeVoicePaginationInput(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

export function resolveVoicePaginationJump(
  value: string,
  totalPages: number,
): number | null {
  const page = Number(value);
  if (!Number.isFinite(page)) return null;
  return Math.max(1, Math.min(totalPages, Math.trunc(page)));
}

export function projectLibraryVoicePick(
  item: CanvasAudioReference,
): VoicePickResult {
  const ref = { ...item.ref };
  return {
    ref,
    label: item.label ?? describeAudioVoiceRef(ref),
    language: item.language ?? undefined,
  };
}

export function projectCustomVoicePick(
  item: CanvasAudioReference,
): VoicePickResult {
  const voiceId = item.ref.voiceId ?? '';
  return {
    ref: {
      scope: 'user_custom',
      voiceId: voiceId || undefined,
    },
    label: item.label ?? voiceId,
    language: item.language ?? undefined,
  };
}

export function isCurrentVoiceReference(
  currentRef: AudioVoiceRef,
  candidateRef: AudioVoiceRef,
): boolean {
  return audioVoiceRefKey(currentRef) === audioVoiceRefKey(candidateRef);
}

export function projectLibraryVoiceRows(
  items: readonly CanvasAudioReference[],
  currentRef: AudioVoiceRef,
): VoiceSelectionRow[] {
  return items.map((item, index) => {
    const pick = projectLibraryVoicePick(item);
    return {
      key: `${audioVoiceRefKey(pick.ref)}-${index}`,
      title: pick.label,
      language: item.language,
      gender: item.gender,
      isActive: isCurrentVoiceReference(currentRef, pick.ref),
      pick,
    };
  });
}

export function projectCustomVoiceRows(
  items: readonly CanvasAudioReference[],
  currentRef: AudioVoiceRef,
): VoiceSelectionRow[] {
  return items.map((item, index) => {
    const pick = projectCustomVoicePick(item);
    const voiceId = pick.ref.voiceId ?? '';
    return {
      key: voiceId || `mine-${index}`,
      title: pick.label,
      language: item.language,
      gender: item.gender,
      isActive: isCurrentVoiceReference(currentRef, pick.ref),
      pick,
    };
  });
}
