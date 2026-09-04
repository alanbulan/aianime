// Copyright (c) 2026 AI anime
import {
  eraseVideoSubtitles as eraseVideoSubtitlesUseCase,
  type EraseVideoSubtitlesParams,
} from "./application/eraseVideoSubtitles";
import { freezoneGenerationTaskGateway } from "./infrastructure/freezoneGenerationTaskGateway";
import { freezoneVideoSubtitleEraseGateway } from "./infrastructure/freezoneVideoSubtitleEraseGateway";

export function eraseVideoSubtitles(params: EraseVideoSubtitlesParams) {
  return eraseVideoSubtitlesUseCase(params, {
    eraseGateway: freezoneVideoSubtitleEraseGateway,
    taskGateway: freezoneGenerationTaskGateway,
  });
}
