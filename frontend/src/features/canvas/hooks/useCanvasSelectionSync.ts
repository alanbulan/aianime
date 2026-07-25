// Copyright (c) 2026 AI anime
import { useEffect, useMemo } from 'react';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';

export interface CanvasSelectionSyncOptions {
  nodes: readonly CanvasNode[];
  selectedNodeId: string | null;
  setSelectedNodeId: (nodeId: string | null) => void;
}

export interface CanvasSelectionSyncResult {
  selectedNodeIds: string[];
  selectedUploadNodeId: string | null;
}

export function useCanvasSelectionSync({
  nodes,
  selectedNodeId,
  setSelectedNodeId,
}: CanvasSelectionSyncOptions): CanvasSelectionSyncResult {
  const selectedNodeIds = useMemo(
    () => nodes.filter((node) => Boolean(node.selected)).map((node) => node.id),
    [nodes],
  );
  const selectedUploadNodeId = useMemo(() => {
    if (selectedNodeIds.length !== 1) {
      return null;
    }
    const selectedNode = nodes.find((node) => node.id === selectedNodeIds[0]);
    return selectedNode?.type === CANVAS_NODE_TYPES.upload
      ? selectedNode.id
      : null;
  }, [nodes, selectedNodeIds]);

  useEffect(() => {
    const nextSelectedNodeId = selectedNodeIds.length === 1
      ? selectedNodeIds[0]
      : null;
    if (selectedNodeId !== nextSelectedNodeId) {
      setSelectedNodeId(nextSelectedNodeId);
    }
  }, [selectedNodeId, selectedNodeIds, setSelectedNodeId]);

  return {
    selectedNodeIds,
    selectedUploadNodeId,
  };
}
