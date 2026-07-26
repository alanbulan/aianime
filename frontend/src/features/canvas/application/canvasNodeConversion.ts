// Copyright (c) 2026 AI anime
import type {
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
} from '../domain/canvasNodes';
import { createCanvasNodeDefaultData } from './canvasNodeDefaultData';
import { nodeCatalog } from './nodeCatalog';
import type { CanvasNodeDefaultDataGateway } from './ports';

export interface CanvasNodeConversionResult {
  nodes: CanvasNode[];
  changed: boolean;
}

export function convertCanvasNodeType(
  nodes: CanvasNode[],
  nodeId: string,
  newType: CanvasNodeType,
  dataOverrides: Partial<CanvasNodeData> = {},
  nodeDefaultDataGateway?: CanvasNodeDefaultDataGateway,
): CanvasNodeConversionResult {
  const target = nodes.find((node) => node.id === nodeId);
  if (!target || target.type === newType) {
    return { nodes, changed: false };
  }

  const mergedData = {
    ...createCanvasNodeDefaultData(
      newType,
      nodeCatalog,
      nodeDefaultDataGateway,
    ),
    ...dataOverrides,
  } as CanvasNodeData;
  const nextNodes = nodes.map((node) =>
    node.id === nodeId
      ? ({
          ...node,
          type: newType,
          data: mergedData,
          measured: undefined,
          width: undefined,
          height: undefined,
        } as CanvasNode)
      : node,
  );

  return { nodes: nextNodes, changed: true };
}
