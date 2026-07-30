// Copyright (c) 2026 AI anime
import type { CanvasGenerationHistoryRecord } from '@/features/canvas/application/generationHistory';
import type {
  CanvasAssetBuckets,
  CanvasAssetKind,
  CanvasMediaUrlResolver,
} from '@/features/canvas/domain/canvasAssets';
import {
  historyRecordOutputUrl,
  historyRecordPreviewImageUrl,
  historyRecordPrompt,
  historyRecordStrictWorldUrl,
  historyRecordWorldUrl,
} from '@/features/canvas/domain/generationHistoryRecord';

export interface HistoryNodeMeta {
  cover: string | null;
  name: string | null;
}

const identityMediaUrl: CanvasMediaUrlResolver = (rawUrl) =>
  typeof rawUrl === 'string' && rawUrl.length > 0 ? rawUrl : null;

export function recordsToAssetBuckets(
  records: readonly CanvasGenerationHistoryRecord[],
  resolveNodeMeta?: (nodeId: string) => HistoryNodeMeta,
  resolveMediaUrl: CanvasMediaUrlResolver = identityMediaUrl,
): CanvasAssetBuckets {
  const buckets: CanvasAssetBuckets = {
    image: [],
    video: [],
    audio: [],
    model: [],
  };
  const seen = new Set<string>();
  for (const record of records) {
    if (record.status !== 'completed' && record.status !== 'succeeded') continue;
    const worldUrl = historyRecordStrictWorldUrl(record);
    const isWorld =
      worldUrl !== null ||
      record.media_type === '3d' ||
      record.media_type === '3gs' ||
      record.media_type === 'ply';
    const kind: CanvasAssetKind | null = isWorld
      ? 'model'
      : record.media_type === 'image' ||
          record.media_type === 'video' ||
          record.media_type === 'audio'
        ? record.media_type
        : null;
    if (!kind) continue;
    const url = resolveMediaUrl(
      kind === 'model'
        ? (worldUrl ?? historyRecordWorldUrl(record))
        : historyRecordOutputUrl(record),
    );
    if (!url) continue;
    const dedupeKey = `${kind}:${url}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const timestamp = new Date(record.recorded_at).getTime();
    const nodeMeta =
      kind === 'model' ? resolveNodeMeta?.(record.node_id) : undefined;
    const prompt = historyRecordPrompt(record);
    buckets[kind].push({
      id: record.id,
      kind,
      url,
      previewUrl: resolveMediaUrl(
        historyRecordPreviewImageUrl(record) ?? nodeMeta?.cover ?? null,
      ),
      nodeId: record.node_id,
      label: prompt ?? nodeMeta?.name ?? null,
      prompt: prompt ?? null,
      model: record.model,
      genMode: record.gen_mode,
      timestamp: Number.isNaN(timestamp) ? null : timestamp,
    });
  }
  return buckets;
}
