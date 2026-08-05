// Copyright (c) 2026 AI anime
import type { CanvasNodeType } from '../domain/canvasNodeData';
import {
  canvasNodeDefinitions,
  getMenuNodeDefinitions,
  type CanvasNodeDefinition,
} from '../domain/canvasNodeRegistry';

export interface NodeCatalog {
  getDefinition: (type: CanvasNodeType) => CanvasNodeDefinition;
  getMenuDefinitions: () => CanvasNodeDefinition[];
}

export const nodeCatalog: NodeCatalog = {
  getDefinition: (type: CanvasNodeType) => canvasNodeDefinitions[type],
  getMenuDefinitions: getMenuNodeDefinitions,
};
