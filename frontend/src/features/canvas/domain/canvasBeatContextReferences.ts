// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  type BeatContextNodeData,
  type CanvasNode,
} from './canvasNodes';

export interface CanvasBeatContextEpisodeReference {
  projectId: string;
  episode: number;
}

export function collectCanvasBeatContextEpisodeReferences(
  nodes: readonly CanvasNode[],
  defaultProjectId: string | null,
): CanvasBeatContextEpisodeReference[] {
  const references = new Map<string, CanvasBeatContextEpisodeReference>();
  for (const node of nodes) {
    if (node.type !== CANVAS_NODE_TYPES.beatContext) {
      continue;
    }
    const data = node.data as BeatContextNodeData;
    const projectId = typeof data.projectId === 'string'
      ? data.projectId
      : defaultProjectId;
    const episode = typeof data.episode === 'number'
      ? data.episode
      : undefined;
    if (!projectId || !episode || episode <= 0) {
      continue;
    }
    references.set(`${projectId}\0${episode}`, { projectId, episode });
  }

  return [...references.values()].sort(
    (left, right) =>
      left.projectId.localeCompare(right.projectId)
      || left.episode - right.episode,
  );
}
