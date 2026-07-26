// Copyright (c) 2026 AI anime
import type {
  CanvasNodeData,
  CanvasNodeType,
} from "../domain/canvasNodes";
import type {
  CanvasNodeDefaultDataGateway,
  NodeCatalog,
} from "./ports";

export function createCanvasNodeDefaultData(
  type: CanvasNodeType,
  nodeCatalog: NodeCatalog,
  nodeDefaultDataGateway?: CanvasNodeDefaultDataGateway,
): CanvasNodeData {
  return {
    ...nodeCatalog.getDefinition(type).createDefaultData(),
    ...nodeDefaultDataGateway?.getOverrides(type),
  } as CanvasNodeData;
}
