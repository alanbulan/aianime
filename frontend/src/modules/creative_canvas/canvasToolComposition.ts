// Copyright (c) 2026 AI anime
import { CanvasToolProcessor } from './application/canvasToolProcessor';
import { browserToolImageGateway } from './infrastructure/browserToolImageGateway';
import { uuidGenerator } from './infrastructure/idGenerator';
import { webImageSplitGateway } from './infrastructure/webImageSplitGateway';

export const canvasToolProcessor = new CanvasToolProcessor(
  webImageSplitGateway,
  browserToolImageGateway,
  uuidGenerator,
);
