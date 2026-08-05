// Copyright (c) 2026 AI anime


import { CanvasNodeFactory, uuidGenerator, type CanvasNodeDefaultDataCatalog, type CanvasNodeDefaultDataGateway, nodeCatalog, type NodeFactory } from '@/modules/creative_canvas/public';
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
