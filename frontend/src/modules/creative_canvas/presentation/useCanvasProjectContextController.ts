// Copyright (c) 2026 AI anime
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  prefetchEpisodeBeats,
  prefetchEpisodeDetail,
} from "@/modules/narrative_planning/public";

import type {
  CanvasBeatContextEpisodeReference,
  CanvasBeatContextReferenceNodeLike,
} from "../domain/canvasBeatContextReferences";
import { useCanvasBeatContextPrefetch } from "./useCanvasBeatContextPrefetch";

export interface CanvasProjectContextControllerOptions {
  projectId: string | null;
  canvasId: string;
  nodes: readonly CanvasBeatContextReferenceNodeLike[];
}

export interface CanvasProjectContextController {
  projectId: string | null;
  canvasId: string;
}

export function useCanvasProjectContextController({
  projectId,
  canvasId,
  nodes,
}: CanvasProjectContextControllerOptions): CanvasProjectContextController {
  const queryClient = useQueryClient();
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

  return { projectId, canvasId };
}
