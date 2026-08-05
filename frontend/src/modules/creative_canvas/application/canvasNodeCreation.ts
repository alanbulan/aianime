// Copyright (c) 2026 AI anime
import { maybeApplyImageAutoResize } from "../domain/imageNodeLayout";

export const SKILL_NODE_DEFAULT_MEASURED = { width: 380, height: 520 } as const;
export const BEAT_CONTEXT_NODE_DEFAULT_MEASURED = {
  width: 420,
  height: 560,
} as const;

export interface CreationGraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
  style?: { width?: unknown; height?: unknown };
  [key: string]: unknown;
}

export interface CreationNodeFactory {
  createNode: (
    type: unknown,
    position: unknown,
    data?: unknown,
  ) => CreationGraphNode;
}

export function createCanvasNode(
  type: string,
  position: { x: number; y: number },
  data: Record<string, unknown>,
  nodeFactory: CreationNodeFactory,
): CreationGraphNode {
  const createdNode = maybeApplyImageAutoResize(
    nodeFactory.createNode(type, position, data),
    data,
  );
  if (createdNode.measured) {
    return createdNode;
  }
  if (createdNode.type === "skillNode") {
    return { ...createdNode, measured: SKILL_NODE_DEFAULT_MEASURED };
  }
  if (createdNode.type === "beatContextNode") {
    return { ...createdNode, measured: BEAT_CONTEXT_NODE_DEFAULT_MEASURED };
  }
  return createdNode;
}
