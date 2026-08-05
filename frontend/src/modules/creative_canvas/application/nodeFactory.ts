// Copyright (c) 2026 AI anime
import {
  createCanvasNodeDefaultData,
  type CanvasNodeDefaultDataCatalog,
  type CanvasNodeDefaultDataGateway,
} from "./canvasNodeDefaultData";

export interface CanvasNodeFactoryIdGenerator {
  next: () => string;
}

export interface CanvasNodeFactoryCreatedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  [key: string]: unknown;
}

export class CanvasNodeFactory {
  constructor(
    private readonly idGenerator: CanvasNodeFactoryIdGenerator,
    private readonly nodeCatalog: CanvasNodeDefaultDataCatalog,
    private readonly nodeDefaultDataGateway: CanvasNodeDefaultDataGateway,
  ) {}

  createNode(
    type: string,
    position: { x: number; y: number },
    data: Record<string, unknown> = {},
  ): CanvasNodeFactoryCreatedNode {
    const nodeData = {
      ...createCanvasNodeDefaultData(
        type,
        this.nodeCatalog,
        this.nodeDefaultDataGateway,
      ),
      ...data,
    } as Record<string, unknown>;

    return {
      id: this.idGenerator.next(),
      type,
      position,
      data: nodeData,
    };
  }
}
