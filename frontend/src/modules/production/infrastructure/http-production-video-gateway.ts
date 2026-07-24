// Copyright (c) 2026 AI anime
import type {
  ProductionDataResponse,
  ProductionVideoGateway,
  Seedance2BeatStatusResponse,
  VideoPoolResponse,
  VideoPoolSelectResponse,
} from "@/modules/production/application/ports";
import type { VideoBackendOption } from "@/modules/production/domain/video-backend";
import type { VideoInputCropTarget } from "@/modules/production/domain/seedance2-panel";
import { p } from "@/shared/api/path";
import { api } from "@/shared/api/transport";

export const httpProductionVideoGateway: ProductionVideoGateway = {
  async listVideoBackends(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/video-backends`, { signal })
      .json<ProductionDataResponse<VideoBackendOption[]>>();
  },
  async getVideoPool(project, episode, signal) {
    return api
      .get(p`api/v1/projects/${project}/episodes/${episode}/video-pool`, {
        signal,
      })
      .json<VideoPoolResponse>();
  },
  async selectVideoPoolEntry(project, episode, beatNumber, poolId) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/video-pool-select`,
        { json: { pool_id: poolId } },
      )
      .json<VideoPoolSelectResponse>();
  },
  async getSeedance2BeatStatus(project, episode, beatNumber, signal) {
    return api
      .get(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/seedance2-status`,
        { signal },
      )
      .json<Seedance2BeatStatusResponse>();
  },
  async uploadSeedance2Asset(project, episode, beatNumber, file) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/seedance2/assets/upload`,
        { body: formData },
      )
      .json<Seedance2BeatStatusResponse>();
  },
  async deleteSeedance2Asset(
    project,
    episode,
    beatNumber,
    mediaKind,
    path,
  ) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/seedance2/assets/delete`,
        { json: { media_kind: mediaKind, path } },
      )
      .json<Seedance2BeatStatusResponse>();
  },
  async cropSeedance2Asset(
    project,
    episode,
    beatNumber,
    assetKey,
    sourcePath,
    target: VideoInputCropTarget,
    crop,
  ) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/seedance2/assets/crop`,
        {
          json: {
            asset_key: assetKey,
            source_path: sourcePath,
            target,
            ...crop,
          },
        },
      )
      .json<Seedance2BeatStatusResponse>();
  },
  async trimSeedance2Asset(
    project,
    episode,
    beatNumber,
    assetKey,
    sourcePath,
    startSeconds,
    durationSeconds,
  ) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/seedance2/assets/audio-trim`,
        {
          json: {
            asset_key: assetKey,
            source_path: sourcePath,
            start_seconds: startSeconds,
            duration_seconds: durationSeconds,
          },
        },
      )
      .json<Seedance2BeatStatusResponse>();
  },
};
