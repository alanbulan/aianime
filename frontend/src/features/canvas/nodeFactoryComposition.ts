// Copyright (c) 2026 AI anime
import { nodeCatalog } from './application/nodeCatalog';
import { CanvasNodeFactory } from './application/nodeFactory';
import { uuidGenerator } from './infrastructure/idGenerator';

export const canvasNodeFactory = new CanvasNodeFactory(
  uuidGenerator,
  nodeCatalog,
);
