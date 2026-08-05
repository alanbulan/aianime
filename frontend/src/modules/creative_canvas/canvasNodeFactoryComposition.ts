// Copyright (c) 2026 AI anime
import { CanvasNodeFactory } from './application/nodeFactory';
import { nodeCatalog } from './application/canvasNodeCatalog';
import type { CanvasNodeDefaultDataCatalog, CanvasNodeDefaultDataGateway } from './application/canvasNodeDefaultData';
import type { NodeFactory } from './application/canvasGraphPorts';
import { uuidGenerator } from './infrastructure/idGenerator';
import {
  browserCanvasNodeDefaultDataGateway,
  rememberLastVideoModel as rememberLastVideoModelInBrowser,
} from './infrastructure/browserCanvasNodeDefaultDataGateway';

export const canvasNodeDefaultDataGateway = browserCanvasNodeDefaultDataGateway;

export const canvasNodeFactory = new CanvasNodeFactory(
  uuidGenerator,
  nodeCatalog as unknown as CanvasNodeDefaultDataCatalog,
  canvasNodeDefaultDataGateway as unknown as CanvasNodeDefaultDataGateway,
) as unknown as NodeFactory;

export function rememberLastVideoModel(modelId: string): void {
  rememberLastVideoModelInBrowser(modelId);
}
