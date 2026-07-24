// Copyright (c) 2026 AI anime
import { createVideoBackendQueryHooks } from "@/modules/production/application/video-backend-query-hooks";
import { createVideoPoolQueryHooks } from "@/modules/production/application/video-pool-query-hooks";
import { httpProductionVideoGateway } from "@/modules/production/infrastructure/http-production-video-gateway";

export const { useVideoBackends } = createVideoBackendQueryHooks(
  httpProductionVideoGateway,
);
export const { useVideoPool, useVideoPoolSelect } = createVideoPoolQueryHooks(
  httpProductionVideoGateway,
);
