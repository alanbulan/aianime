// Copyright (c) 2026 AI anime
import { nodeCatalog } from './application/nodeCatalog';
import { CanvasNodeFactory } from './application/nodeFactory';
import { uuidGenerator } from '@/modules/creative_canvas/public';
import {
  browserCanvasNodeDefaultDataGateway,
  rememberLastVideoModel as rememberLastVideoModelInBrowser,
} from './infrastructure/browserCanvasNodeDefaultDataGateway';

export const canvasNodeDefaultDataGateway = browserCanvasNodeDefaultDataGateway;

export const canvasNodeFactory = new CanvasNodeFactory(
  uuidGenerator,
  nodeCatalog,
  canvasNodeDefaultDataGateway,
);

export function rememberLastVideoModel(modelId: string): void {
  rememberLastVideoModelInBrowser(modelId);
}
