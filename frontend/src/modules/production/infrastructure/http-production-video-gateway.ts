// Copyright (c) 2026 AI anime
import type {
  ProductionDataResponse,
  ProductionVideoGateway,
  VideoPoolResponse,
  VideoPoolSelectResponse,
} from "@/modules/production/application/ports";
import type { VideoBackendOption } from "@/modules/production/domain/video-backend";
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
};
