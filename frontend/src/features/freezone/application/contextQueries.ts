// Copyright (c) 2026 AI anime
import type {
  FreezoneBeatContextResponse,
  FreezoneProjectAsset,
} from "../domain/beatContext";

export interface FreezoneQueryOptions {
  signal?: AbortSignal;
}

export interface FreezoneBeatContextQueryOptions extends FreezoneQueryOptions {
  episode?: number;
  beat?: number;
}

export interface FreezoneContextQueryGateway {
  listProjectAssets(
    projectId: string,
    options?: FreezoneQueryOptions,
  ): Promise<FreezoneProjectAsset[]>;
  listBeatContext(
    projectId: string,
    options?: FreezoneBeatContextQueryOptions,
  ): Promise<FreezoneBeatContextResponse>;
}

export function listFreezoneProjectAssets(
  projectId: string,
  options: FreezoneQueryOptions | undefined,
  gateway: FreezoneContextQueryGateway,
): Promise<FreezoneProjectAsset[]> {
  return gateway.listProjectAssets(projectId, options);
}

export function listFreezoneBeatContext(
  projectId: string,
  options: FreezoneBeatContextQueryOptions | undefined,
  gateway: FreezoneContextQueryGateway,
): Promise<FreezoneBeatContextResponse> {
  return gateway.listBeatContext(projectId, options);
}
