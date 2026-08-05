// Copyright (c) 2026 AI anime
import type {
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  CanvasPosition,
} from '../domain/canvasNodes';
import type {
  CanvasNodeDefaultDataGateway,
  IdGenerator,
  NodeCatalog,
  NodeFactory,
} from './ports';
import { createCanvasNodeDefaultData } from '@/modules/creative_canvas/public';

export class CanvasNodeFactory implements NodeFactory {
  constructor(
    private readonly idGenerator: IdGenerator,
    private readonly nodeCatalog: NodeCatalog,
    private readonly nodeDefaultDataGateway: CanvasNodeDefaultDataGateway,
  ) {}

  createNode(
    type: CanvasNodeType,
    position: CanvasPosition,
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
