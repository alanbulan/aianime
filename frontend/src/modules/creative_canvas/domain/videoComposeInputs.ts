// Copyright (c) 2026 AI anime
import type { ComposeTrackKind } from './videoComposeTimeline';

export const MIN_VIDEO_COMPOSE_VIDEOS = 2;

export interface VideoComposeSourceMedia {
  readonly nodeId: string;
  readonly kind: ComposeTrackKind;
  readonly sourceUrl: string;
  readonly displayName: string | null;
  readonly thumbUrl: string | null;
  readonly durationMs: number | null;
}

export interface VideoComposeInputMedia extends VideoComposeSourceMedia {
  readonly verticalPosition: number;
}

export interface VideoComposeInputProjection {
  readonly seedNodeIds: string[];
  readonly videoCount: number;
  readonly canOpen: boolean;
  readonly sourceMedia: VideoComposeSourceMedia[];
}

export function projectVideoComposeInputs(
  inputs: readonly VideoComposeInputMedia[],
): VideoComposeInputProjection {
  const sourceMedia = [...inputs]
    .filter((input) => Boolean(input.sourceUrl))
    .sort((left, right) => left.verticalPosition - right.verticalPosition)
    .map((input) => ({
      nodeId: input.nodeId,
      kind: input.kind,
      sourceUrl: input.sourceUrl,
      displayName: input.displayName,
      thumbUrl: input.thumbUrl,
      durationMs: input.durationMs,
    }));
  const seedNodeIds = sourceMedia.map((source) => source.nodeId);
  const videoCount = sourceMedia.filter(
    (source) => source.kind === 'video',
  ).length;

  return {
    seedNodeIds,
    videoCount,
    canOpen: videoCount >= MIN_VIDEO_COMPOSE_VIDEOS,
    sourceMedia,
  };
}
