// Copyright (c) 2026 AI anime
import type { CanvasNode, CanvasNodeData } from '../domain/canvasNodes';
import { maybeApplyImageAutoResize } from './imageNodeLayout';

export interface CanvasNodeDataUpdateResult {
  nodes: CanvasNode[];
  changed: boolean;
}

export function updateCanvasNodeData(
  nodes: CanvasNode[],
  nodeId: string,
  patch: Partial<CanvasNodeData>,
): CanvasNodeDataUpdateResult {
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }

    const hasDataChange = Object.entries(patch).some(([key, nextValue]) => {
      const previousValue = (node.data as Record<string, unknown>)[key];
      return !Object.is(previousValue, nextValue);
    });
    if (!hasDataChange) {
      return node;
    }

    const mergedData = {
      ...node.data,
      ...patch,
    } as CanvasNodeData;
    changed = true;
    return maybeApplyImageAutoResize(
      {
        ...node,
        data: mergedData,
      },
      patch,
    );
  });

  return {
    nodes: changed ? nextNodes : nodes,
    changed,
  };
}
