// Copyright (c) 2026 AI anime
import { useEffect, useRef } from 'react';

import {
  collectCanvasBeatContextEpisodeReferences,
  type CanvasBeatContextEpisodeReference,
} from '../domain/canvasBeatContextReferences';
import type { CanvasNode } from '../domain/canvasNodes';

export interface CanvasBeatContextPrefetchOptions {
  nodes: readonly CanvasNode[];
  defaultProjectId: string | null;
  prefetchEpisode: (reference: CanvasBeatContextEpisodeReference) => void;
}

function referencesEqual(
  left: readonly CanvasBeatContextEpisodeReference[],
  right: readonly CanvasBeatContextEpisodeReference[],
): boolean {
  return left.length === right.length && left.every(
    (reference, index) =>
      reference.projectId === right[index]?.projectId
      && reference.episode === right[index]?.episode,
  );
}

export function useCanvasBeatContextPrefetch({
  nodes,
  defaultProjectId,
  prefetchEpisode,
}: CanvasBeatContextPrefetchOptions): void {
  const references = collectCanvasBeatContextEpisodeReferences(
    nodes,
    defaultProjectId,
  );
  const stableReferencesRef = useRef(references);
  if (!referencesEqual(stableReferencesRef.current, references)) {
    stableReferencesRef.current = references;
  }
  const stableReferences = stableReferencesRef.current;

  useEffect(() => {
    for (const reference of stableReferences) {
      prefetchEpisode(reference);
    }
  }, [prefetchEpisode, stableReferences]);
}
