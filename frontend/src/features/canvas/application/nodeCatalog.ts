// Copyright (c) 2026 AI anime
import { canvasNodeDefinitions, getMenuNodeDefinitions } from '../domain/nodeRegistry';
;
import type { NodeCatalog } from './ports';

import type { CanvasNodeType } from "@/modules/creative_canvas/public";
export const nodeCatalog: NodeCatalog = {
  getDefinition: (type: CanvasNodeType) => canvasNodeDefinitions[type],
  getMenuDefinitions: getMenuNodeDefinitions,
};
