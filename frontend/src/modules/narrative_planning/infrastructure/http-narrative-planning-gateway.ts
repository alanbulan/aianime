// Copyright (c) 2026 AI anime
import type {
  DataResponse,
  GeneratedRewrite,
  NarrativeErrorResult,
  NarrativePlanningGateway,
  NarrativeTaskStartResult,
  PlanEpisodeAssetsResponse,
} from "@/modules/narrative_planning/application/ports";
import type {
  Beat,
  Episode,
  PipelineStatus,
  Script,
} from "@/modules/narrative_planning/domain/types";
import { jsonWithBackendError } from "@/shared/api/errors";
import { p } from "@/shared/api/path";
import { api } from "@/shared/api/transport";

const LONG_IDENTITY_PLAN_TIMEOUT_MS = 180_000;

export const httpNarrativePlanningGateway: NarrativePlanningGateway = {
  async listEpisodes(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/episodes`, { signal })
      .json<DataResponse<Episode[]>>();
  },

  async getPipelineStatus(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/pipeline/status`, { signal })
      .json<DataResponse<PipelineStatus>>();
  },

  async planEpisodes(project, params) {
    return jsonWithBackendError<NarrativeTaskStartResult>(
      api.post(p`api/v1/projects/${project}/episodes/plan`, {
        json: params ?? {},
        throwHttpErrors: false,
      }),
    );
  },

  async updateEpisode(project, episode, data) {
    return api
      .patch(p`api/v1/projects/${project}/episodes/${episode}`, { json: data })
      .json<DataResponse<Episode>>();
  },

  async planIdentities(project, episode) {
    return jsonWithBackendError<NarrativeTaskStartResult>(
      api.post(
        p`api/v1/projects/${project}/episodes/${episode}/identities/plan`,
        {
          timeout: LONG_IDENTITY_PLAN_TIMEOUT_MS,
          throwHttpErrors: false,
        },
      ),
    );
  },

  async planEpisodeAssets(project, episode, kind) {
    return jsonWithBackendError<PlanEpisodeAssetsResponse>(
      api.post(
        p`api/v1/projects/${project}/episodes/${episode}/${kind === "scene" ? "scenes" : "props"}/plan`,
        { throwHttpErrors: false },
      ),
    );
  },

  async getEpisode(project, episode, signal) {
    return api
      .get(p`api/v1/projects/${project}/episodes/${episode}`, { signal })
      .json<DataResponse<Episode>>();
  },

  async getBeats(project, episode, signal) {
    return api
      .get(p`api/v1/projects/${project}/episodes/${episode}/beats`, { signal })
      .json<DataResponse<Beat[]>>();
  },

  async insertManualShot(project, episode, data) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/insert-manual`,
        { json: data },
      )
      .json<DataResponse<Beat> | NarrativeErrorResult>();
  },

  async deleteManualShot(project, episode, beat) {
    return api
      .delete(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beat}/manual-shot`,
      )
      .json<DataResponse<{ beats: Beat[] }> | NarrativeErrorResult>();
  },

  async getScript(project, episode, signal) {
    return api
      .get(p`api/v1/projects/${project}/episodes/${episode}/script`, { signal })
      .json<DataResponse<Script | null>>();
  },

  async generateScript(project, episode, params) {
    return jsonWithBackendError<NarrativeTaskStartResult>(
      api.post(p`api/v1/projects/${project}/episodes/${episode}/script/generate`, {
        json: params ?? {},
        throwHttpErrors: false,
      }),
    );
  },

  async generateRewrite(project, episode, params) {
    return api
      .post(p`api/v1/projects/${project}/episodes/${episode}/rewrite/generate`, {
        json: params ?? {},
      })
      .json<DataResponse<GeneratedRewrite> | NarrativeErrorResult>();
  },

  async updateBeat(project, episode, beat, data) {
    return api
      .patch(p`api/v1/projects/${project}/episodes/${episode}/beats/${beat}`, {
        json: data,
      })
      .json<DataResponse<Beat>>();
  },

  async saveScript(project, episode, beats) {
    return api
      .put(p`api/v1/projects/${project}/episodes/${episode}/script`, {
        json: { beats },
      })
      .json<DataResponse<{ episode: number; beats_count: number }>>();
  },
};
