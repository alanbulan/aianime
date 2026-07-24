// Copyright (c) 2026 AI anime
import { useMutation } from "@tanstack/react-query";

import type { ProductionVideoGateway } from "@/modules/production/application/ports";
import type {
  CreateRenderPlanCommand,
  ExecuteRenderPlanCommand,
} from "@/modules/production/domain/render-plan";

export function createRenderPlanQueryHooks(gateway: ProductionVideoGateway) {
  function useRenderPlan(project: string, episode: number) {
    return useMutation({
      mutationFn: (command: CreateRenderPlanCommand) =>
        gateway.createRenderPlan(project, episode, command),
    });
  }

  function useRenderExecute(project: string, episode: number) {
    return useMutation({
      mutationFn: (command: ExecuteRenderPlanCommand) =>
        gateway.executeRenderPlan(project, episode, command),
    });
  }

  return { useRenderPlan, useRenderExecute };
}
