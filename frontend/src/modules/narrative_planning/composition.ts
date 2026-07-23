import {
  createNarrativePlanningQueryHooks,
  isPlanEpisodeAssetsResult,
} from "@/modules/narrative_planning/application/query-hooks";
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

export { isPlanEpisodeAssetsResult };
