// Copyright (c) 2026 AI anime
import {
  isAudioNode,
  isVideoNode,
  type CanvasNode,
} from './canvasNodes';

export const MIN_VIDEO_COMPOSE_VIDEOS = 2;

export interface VideoComposeInputProjection {
  readonly seedNodeIds: string[];
  readonly videoCount: number;
  readonly canOpen: boolean;
}

export function projectVideoComposeInputs(
  upstreamNodes: readonly CanvasNode[],
): VideoComposeInputProjection {
  const seedNodeIds = [...upstreamNodes]
    .filter((node) => (
      (isVideoNode(node) && Boolean(node.data.videoUrl)) ||
      (isAudioNode(node) && Boolean(node.data.audioUrl))
    ))
    .sort((left, right) =>
      (left.position?.y ?? 0) - (right.position?.y ?? 0),
    )
    .map((node) => node.id);
  const videoCount = upstreamNodes.filter(
    (node) => isVideoNode(node) && Boolean(node.data.videoUrl),
  ).length;

  return {
    seedNodeIds,
    videoCount,
    canOpen: videoCount >= MIN_VIDEO_COMPOSE_VIDEOS,
  };
}
