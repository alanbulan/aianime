// Copyright (c) 2026 AI anime
import { useEffect, useMemo } from "react";

export interface CanvasSelectionSyncNode {
  id: string;
  selected?: boolean;
}

export interface CanvasSelectionSyncOptions<
  TNode extends CanvasSelectionSyncNode = CanvasSelectionSyncNode,
> {
  nodes: readonly TNode[];
  selectedNodeId: string | null;
  setSelectedNodeId: (nodeId: string | null) => void;
  isUploadNode: (node: TNode) => boolean;
}

export interface CanvasSelectionSyncResult {
  selectedNodeIds: string[];
  selectedUploadNodeId: string | null;
}

export function useCanvasSelectionSync<
  TNode extends CanvasSelectionSyncNode,
>({
  nodes,
  selectedNodeId,
  setSelectedNodeId,
  isUploadNode,
}: CanvasSelectionSyncOptions<TNode>): CanvasSelectionSyncResult {
  const selectedNodeIds = useMemo(
    () => nodes.filter((node) => Boolean(node.selected)).map((node) => node.id),
    [nodes],
  );
  const selectedUploadNodeId = useMemo(() => {
    if (selectedNodeIds.length !== 1) {
      return null;
    }
    const selectedNode = nodes.find((node) => node.id === selectedNodeIds[0]);
    return selectedNode && isUploadNode(selectedNode) ? selectedNode.id : null;
  }, [isUploadNode, nodes, selectedNodeIds]);

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
