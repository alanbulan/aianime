// Copyright (c) 2026 AI anime
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  CanvasPosition,
} from '../domain/canvasNodeData';

export interface CanvasGraphSnapshot {
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
}

export interface CanvasGraphGateway {
  getSnapshot: () => CanvasGraphSnapshot;
  addNode: (
    type: CanvasNodeType,
    position: CanvasPosition,
    data?: Partial<CanvasNodeData>,
  ) => string | null;
  addEdgeWithData: (
    source: string,
    target: string,
    data: Record<string, unknown>,
    options?: {
      id?: string;
      sourceHandle?: string;
      targetHandle?: string;
    },
  ) => string | null;
  updateNodeData: (
    nodeId: string,
    data: Partial<CanvasNodeData>,
  ) => void;
}

export interface NodeFactory {
  createNode: (
    type: CanvasNodeType,
    position: CanvasPosition,
    data?: Partial<CanvasNodeData>
  ) => CanvasNode;
}
