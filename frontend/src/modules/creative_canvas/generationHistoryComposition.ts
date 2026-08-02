// Copyright (c) 2026 AI anime
import {
  queryCanvasGenerationHistory,
  queryNodeGenerationHistory,
  type GetCanvasGenerationHistoryParams,
  type GetNodeGenerationHistoryParams,
} from "./application/generationHistory";
import {
  freezoneGenerationHistoryGateway,
} from "./infrastructure/freezoneGenerationHistoryGateway";

export function getNodeGenerationHistory(
  params: GetNodeGenerationHistoryParams,
) {
  return queryNodeGenerationHistory(params, freezoneGenerationHistoryGateway);
}

export function getCanvasGenerationHistory(
  params: GetCanvasGenerationHistoryParams,
) {
  return queryCanvasGenerationHistory(params, freezoneGenerationHistoryGateway);
}
