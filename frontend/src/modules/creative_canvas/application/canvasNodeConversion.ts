// Copyright (c) 2026 AI anime
import { createCanvasNodeDefaultData } from "./canvasNodeDefaultData";

export interface ConversionGraphNode {
  id: string;
  type?: string | null;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
  style?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ConversionNodeCatalog {
  getDefinition(type: unknown): { createDefaultData(): Record<string, unknown> };
}

export interface ConversionDefaultDataGateway {
  getOverrides(type: unknown): Record<string, unknown> | undefined;
}

export interface CanvasNodeConversionResult {
  nodes: ConversionGraphNode[];
  changed: boolean;
}

export function convertCanvasNodeType(
  nodes: ConversionGraphNode[],
  nodeId: string,
  newType: string,
  nodeCatalog: ConversionNodeCatalog,
  dataOverrides: Record<string, unknown> = {},
  nodeDefaultDataGateway?: ConversionDefaultDataGateway,
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
  } as Record<string, unknown>;
  const nextNodes = nodes.map((node) =>
    node.id === nodeId
      ? ({
          ...node,
          type: newType,
          data: mergedData,
          measured: undefined,
          width: undefined,
          height: undefined,
        } as ConversionGraphNode)
      : node,
  );

  return { nodes: nextNodes, changed: true };
}
