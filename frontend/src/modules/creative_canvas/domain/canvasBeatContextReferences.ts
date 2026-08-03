// Copyright (c) 2026 AI anime
export interface CanvasBeatContextReferenceNodeLike {
  type?: string | null;
  data?: unknown;
}

export interface CanvasBeatContextEpisodeReference {
  projectId: string;
  episode: number;
}

export function collectCanvasBeatContextEpisodeReferences(
  nodes: readonly CanvasBeatContextReferenceNodeLike[],
  defaultProjectId: string | null,
): CanvasBeatContextEpisodeReference[] {
  const references = new Map<string, CanvasBeatContextEpisodeReference>();
  for (const node of nodes) {
    if (node.type !== "beatContextNode") {
      continue;
    }
    const data = node.data && typeof node.data === "object"
      ? node.data as Record<string, unknown>
      : undefined;
    const projectId = typeof data?.projectId === "string"
      ? data.projectId
      : defaultProjectId;
    const episode = typeof data?.episode === "number"
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
