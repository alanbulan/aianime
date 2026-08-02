// Copyright (c) 2026 AI anime
import {
  createNarrativePlanningQueryHooks,
  isPlanEpisodeAssetsResult,
} from "@/modules/narrative_planning/application/query-hooks";
import {
  listBeats as listBeatsUseCase,
  listEpisodes as listEpisodesUseCase,
} from "@/modules/narrative_planning/application/catalog-queries";
import type { BeatUpdate } from "@/modules/narrative_planning/domain/types";
import { httpNarrativePlanningGateway } from "@/modules/narrative_planning/infrastructure/http-narrative-planning-gateway";

export const narrativePlanningQueries = createNarrativePlanningQueryHooks(
  httpNarrativePlanningGateway,
);

export const {
  episodeBeatsQueryOptions,
  episodeDetailQueryOptions,
  episodesQueryOptions,
  pipelineStatusQueryOptions,
  prefetchEpisodeBeats,
  prefetchEpisodeDetail,
  useDeleteManualShot,
  useEpisodeBeats,
  useEpisodeDetail,
  useEpisodes,
  useGenerateRewrite,
  useGenerateScript,
  useInsertManualShot,
  usePipelineStatus,
  usePlanEpisodeProps,
  usePlanEpisodeScenes,
  usePlanEpisodes,
  usePlanIdentities,
  useSaveScript,
  useScript,
  useUpdateBeat,
  useUpdateEpisode,
} = narrativePlanningQueries;

export const readPipelineStatus = (
  project: string,
  signal?: AbortSignal,
) => httpNarrativePlanningGateway.getPipelineStatus(project, signal);

export const updateBeat = (
  project: string,
  episode: number,
  beat: number,
  data: BeatUpdate,
) => httpNarrativePlanningGateway.updateBeat(project, episode, beat, data);

export const listEpisodes = (project: string) =>
  listEpisodesUseCase(project, httpNarrativePlanningGateway);

export const listBeats = (project: string, episode: number) =>
  listBeatsUseCase(project, episode, httpNarrativePlanningGateway);

export { isPlanEpisodeAssetsResult };
