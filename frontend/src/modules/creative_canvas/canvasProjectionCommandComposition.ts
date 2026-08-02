// Copyright (c) 2026 AI anime
import {
  buildProjectionFromPreset,
  createCanvasProjectionCommands,
} from "./application/canvasProjection";
import {
  consumeQueuedLocalFreezoneProjections,
  queueLocalFreezoneProjection,
  removeLocalFreezoneProjection,
} from "./application/canvasRuntimeState";
import { markCanvasProjectionFresh } from "./application/canvasProjectionStatusState";
import { canvasProjectionCommandEvents } from "./application/canvasProjectionCommandEvents";
import { httpFreezoneCanvasProjectionGateway } from "./infrastructure/httpFreezoneCanvasProjectionGateway";
import { createUseCanvasProjectionCommandController } from "./presentation/useCanvasProjectionCommandController";

const commands = createCanvasProjectionCommands({
  buildProjection: (params) =>
    buildProjectionFromPreset(params, httpFreezoneCanvasProjectionGateway),
  queueProjection: queueLocalFreezoneProjection,
  consumeProjectionQueue: consumeQueuedLocalFreezoneProjections,
  removeProjection: removeLocalFreezoneProjection,
  markProjectionFresh: markCanvasProjectionFresh,
});

export const useCanvasProjectionCommandController =
  createUseCanvasProjectionCommandController({
    events: canvasProjectionCommandEvents,
    commands,
  });
