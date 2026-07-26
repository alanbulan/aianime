// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { readUrl } from '@/lib/url-params';
import {
  prefetchEpisodeBeats,
  prefetchEpisodeDetail,
} from '@/modules/narrative_planning/public';

import type {
  CanvasBeatContextEpisodeReference,
} from '../domain/canvasBeatContextReferences';
import type { CanvasNode } from '../domain/canvasNodes';
import { useCanvasBeatContextPrefetch } from './useCanvasBeatContextPrefetch';

export interface CanvasProjectContextControllerOptions {
  nodes: readonly CanvasNode[];
}

export interface CanvasProjectContextController {
  projectId: string | null;
}

export function useCanvasProjectContextController({
  nodes,
}: CanvasProjectContextControllerOptions): CanvasProjectContextController {
  const queryClient = useQueryClient();
  const projectId = useMemo(() => readUrl().project, []);
  const prefetchEpisode = useCallback(
    ({
      projectId: referenceProjectId,
      episode,
    }: CanvasBeatContextEpisodeReference) => {
      prefetchEpisodeBeats(queryClient, referenceProjectId, episode);
      prefetchEpisodeDetail(queryClient, referenceProjectId, episode);
    },
    [queryClient],
  );

  useCanvasBeatContextPrefetch({
    nodes,
    defaultProjectId: projectId,
    prefetchEpisode,
  });

  return { projectId };
}
