// Copyright (c) 2026 AI anime
import {
  listFreezoneBeatContext as listFreezoneBeatContextUseCase,
  listFreezoneProjectAssets as listFreezoneProjectAssetsUseCase,
  type FreezoneBeatContextQueryOptions,
  type FreezoneQueryOptions,
} from "./application/contextQueries";
import { httpFreezoneContextQueryGateway } from "./infrastructure/httpFreezoneContextQueryGateway";

export function listFreezoneProjectAssets(
  projectId: string,
  options?: FreezoneQueryOptions,
) {
  return listFreezoneProjectAssetsUseCase(
    projectId,
    options,
    httpFreezoneContextQueryGateway,
  );
}

export function listFreezoneBeatContext(
  projectId: string,
  options?: FreezoneBeatContextQueryOptions,
) {
  return listFreezoneBeatContextUseCase(
    projectId,
    options,
    httpFreezoneContextQueryGateway,
  );
}
