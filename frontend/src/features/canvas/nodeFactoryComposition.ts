// Copyright (c) 2026 AI anime
import { nodeCatalog } from './application/nodeCatalog';
import { CanvasNodeFactory } from './application/nodeFactory';
import {
  browserCanvasNodeDefaultDataGateway,
  rememberLastVideoModel as rememberLastVideoModelInBrowser,
} from './infrastructure/browserCanvasNodeDefaultDataGateway';
import { uuidGenerator } from './infrastructure/idGenerator';

export const canvasNodeDefaultDataGateway = browserCanvasNodeDefaultDataGateway;

export const canvasNodeFactory = new CanvasNodeFactory(
  uuidGenerator,
  nodeCatalog,
  canvasNodeDefaultDataGateway,
);

export function rememberLastVideoModel(modelId: string): void {
  rememberLastVideoModelInBrowser(modelId);
}
