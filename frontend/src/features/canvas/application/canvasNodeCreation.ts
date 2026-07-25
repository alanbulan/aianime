// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
} from '../domain/canvasNodes';
import {
  BEAT_CONTEXT_NODE_DEFAULT_MEASURED,
  SKILL_NODE_DEFAULT_MEASURED,
} from './canvasNodeHydration';
import { maybeApplyImageAutoResize } from './imageNodeLayout';
import type { NodeFactory } from './ports';

export function createCanvasNode(
  type: CanvasNodeType,
  position: CanvasNode['position'],
  data: Partial<CanvasNodeData>,
  nodeFactory: NodeFactory,
): CanvasNode {
  const createdNode = maybeApplyImageAutoResize(
    nodeFactory.createNode(type, position, data),
    data,
  );
  if (createdNode.measured) {
    return createdNode;
  }
  if (createdNode.type === CANVAS_NODE_TYPES.skill) {
    return { ...createdNode, measured: SKILL_NODE_DEFAULT_MEASURED };
  }
  if (createdNode.type === CANVAS_NODE_TYPES.beatContext) {
    return { ...createdNode, measured: BEAT_CONTEXT_NODE_DEFAULT_MEASURED };
  }
  return createdNode;
}
