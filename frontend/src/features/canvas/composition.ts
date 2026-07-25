// Copyright (c) 2026 AI anime
import { nodeCatalog } from './application/nodeCatalog';
import { CanvasNodeFactory } from './application/nodeFactory';
import { CanvasToolProcessor } from './application/toolProcessor';
import { freezoneAiGateway } from './infrastructure/freezoneAiGateway';
import { uuidGenerator } from './infrastructure/idGenerator';
import { webImageSplitGateway } from './infrastructure/webImageSplitGateway';

export const canvasNodeFactory = new CanvasNodeFactory(
  uuidGenerator,
  nodeCatalog,
);
export const canvasToolProcessor = new CanvasToolProcessor(
  webImageSplitGateway,
  uuidGenerator,
);
export const canvasAiGateway = freezoneAiGateway;
