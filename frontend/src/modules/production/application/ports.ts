// Copyright (c) 2026 AI anime
import type { VideoBackendOption } from "@/modules/production/domain/video-backend";

export interface ProductionDataResponse<T> {
  ok: true;
  data: T;
}

export interface ProductionVideoGateway {
  listVideoBackends(
    project: string,
    signal?: AbortSignal,
  ): Promise<ProductionDataResponse<VideoBackendOption[]>>;
}
