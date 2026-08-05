// Copyright (c) 2026 AI anime
import {
  canvasNodeDefinitions,
  getMenuNodeDefinitions,
  type CanvasNodeType,
} from "@/modules/creative_canvas/public";
import type { NodeCatalog } from './ports';
export const nodeCatalog: NodeCatalog = {
  getDefinition: (type: CanvasNodeType) => canvasNodeDefinitions[type],
  getMenuDefinitions: getMenuNodeDefinitions,
};
