// Copyright (c) 2026 AI anime
import { awaitTaskCompletion } from "@/modules/task_execution/public";

import type { CanvasTaskResultGateway } from "./application/completeCanvasMediaGenerationTask";
import {
  eraseVideoSubtitles as eraseVideoSubtitlesUseCase,
  type EraseVideoSubtitlesParams,
} from "./application/eraseVideoSubtitles";
import { fetchCanvasGenerationResultUrl } from "./infrastructure/freezoneGenerationResultGateway";
import { freezoneVideoSubtitleEraseGateway } from "./infrastructure/freezoneVideoSubtitleEraseGateway";

const taskGateway: CanvasTaskResultGateway = {
  awaitCompletion: awaitTaskCompletion,
  fetchResultUrl: fetchCanvasGenerationResultUrl,
};

export function eraseVideoSubtitles(params: EraseVideoSubtitlesParams) {
  return eraseVideoSubtitlesUseCase(params, {
    eraseGateway: freezoneVideoSubtitleEraseGateway,
    taskGateway,
  });
}
