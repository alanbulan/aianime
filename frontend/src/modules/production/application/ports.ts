// Copyright (c) 2026 AI anime
import type { VideoBackendOption } from "@/modules/production/domain/video-backend";
import type { VideoPoolData } from "@/modules/production/domain/video-pool";
import type {
  Seedance2BeatStatus,
  VideoInputCropTarget,
} from "@/modules/production/domain/seedance2-panel";

export interface ProductionDataResponse<T> {
  ok: true;
  data: T;
}

export interface ProductionErrorResponse {
  ok: false;
  error: string;
  code?: string;
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
  getSeedance2BeatStatus(
    project: string,
    episode: number,
    beatNumber: number,
    signal?: AbortSignal,
  ): Promise<Seedance2BeatStatusResponse>;
  uploadSeedance2Asset(
    project: string,
    episode: number,
    beatNumber: number,
    file: File,
  ): Promise<Seedance2BeatStatusResponse>;
  deleteSeedance2Asset(
    project: string,
    episode: number,
    beatNumber: number,
    mediaKind: "images" | "audios",
    path: string,
  ): Promise<Seedance2BeatStatusResponse>;
  cropSeedance2Asset(
    project: string,
    episode: number,
    beatNumber: number,
    assetKey: string,
    sourcePath: string,
    target: VideoInputCropTarget,
    crop: { x: number; y: number; width: number; height: number },
  ): Promise<Seedance2BeatStatusResponse>;
  trimSeedance2Asset(
    project: string,
    episode: number,
    beatNumber: number,
    assetKey: string,
    sourcePath: string,
    startSeconds: number,
    durationSeconds: number,
  ): Promise<Seedance2BeatStatusResponse>;
}

export type VideoPoolResponse = ProductionDataResponse<VideoPoolData | null>;

export type Seedance2BeatStatusResponse =
  | ProductionDataResponse<Seedance2BeatStatus>
  | ProductionErrorResponse;

export interface VideoPoolSelectResponse {
  ok: boolean;
  error?: string;
  data?: {
    beat_num: number;
    pool_id: string;
    video_url: string;
  };
}
