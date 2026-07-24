// Copyright (c) 2026 AI anime
import type { VideoBackendOption } from "@/modules/production/domain/video-backend";
import type { VideoPoolData } from "@/modules/production/domain/video-pool";

export interface ProductionDataResponse<T> {
  ok: true;
  data: T;
}

export interface ProductionVideoGateway {
  listVideoBackends(
    project: string,
    signal?: AbortSignal,
  ): Promise<ProductionDataResponse<VideoBackendOption[]>>;
  getVideoPool(
    project: string,
    episode: number,
    signal?: AbortSignal,
  ): Promise<VideoPoolResponse>;
  selectVideoPoolEntry(
    project: string,
    episode: number,
    beatNumber: number,
    poolId: string,
  ): Promise<VideoPoolSelectResponse>;
}

export type VideoPoolResponse = ProductionDataResponse<VideoPoolData | null>;

export interface VideoPoolSelectResponse {
  ok: boolean;
  error?: string;
  data?: {
    beat_num: number;
    pool_id: string;
    video_url: string;
  };
}
