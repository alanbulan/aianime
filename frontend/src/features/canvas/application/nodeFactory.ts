// Copyright (c) 2026 AI anime
import type { XYPosition } from '@xyflow/react';

import type { CanvasNode, CanvasNodeData, CanvasNodeType } from '../domain/canvasNodes';
import { createCanvasNodeDefaultData } from './canvasNodeDefaultData';
import type {
  CanvasNodeDefaultDataGateway,
  IdGenerator,
  NodeCatalog,
  NodeFactory,
} from './ports';

export class CanvasNodeFactory implements NodeFactory {
  constructor(
    private readonly idGenerator: IdGenerator,
    private readonly nodeCatalog: NodeCatalog,
    private readonly nodeDefaultDataGateway: CanvasNodeDefaultDataGateway,
  ) {}

  createNode(
    type: CanvasNodeType,
    position: XYPosition,
    data: Partial<CanvasNodeData> = {}
  ): CanvasNode {
    const nodeData = {
      ...createCanvasNodeDefaultData(
        type,
        this.nodeCatalog,
        this.nodeDefaultDataGateway,
      ),
      ...data,
    } as CanvasNodeData;

    return {
      id: this.idGenerator.next(),
      type,
      position,
      data: nodeData,
    };
  }
}
