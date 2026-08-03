// Copyright (c) 2026 AI anime
export interface CanvasSelectionNode {
  id: string;
  parentId?: string;
}

export interface CanvasSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CanvasSelectionNodeIntersectsRect<
  TNode extends CanvasSelectionNode,
> = (
  node: TNode,
  selectionRect: CanvasSelectionRect,
  nodeMap: ReadonlyMap<string, TNode>,
) => boolean;

export interface CanvasSelectionDialogTarget {
  nodeId: string;
}

export function collectCanvasNodeIdsInRect<
  TNode extends CanvasSelectionNode,
>(
  nodes: readonly TNode[],
  selectionRect: CanvasSelectionRect,
  nodeIntersectsRect: CanvasSelectionNodeIntersectsRect<TNode>,
): Set<string> {
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const hitIds = new Set(
    nodes
      .filter((node) => nodeIntersectsRect(node, selectionRect, nodeMap))
      .map((node) => node.id),
  );

  // Moving a selected container and its selected child would apply the delta twice.
  const ancestorHitIds = new Set<string>();
  for (const nodeId of hitIds) {
    const visited = new Set<string>();
    let parentId = nodeMap.get(nodeId)?.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      if (hitIds.has(parentId)) {
        ancestorHitIds.add(parentId);
      }
      parentId = nodeMap.get(parentId)?.parentId;
    }
  }

  return new Set([...hitIds].filter((nodeId) => !ancestorHitIds.has(nodeId)));
}

export function resolveSelectedNodeId<TNode extends CanvasSelectionNode>(
  selectedNodeId: string | null,
  nodes: readonly TNode[],
): string | null {
  if (!selectedNodeId) {
    return null;
  }
  return nodes.some((node) => node.id === selectedNodeId)
    ? selectedNodeId
    : null;
}

export function resolveActiveToolDialog<
  TDialog extends CanvasSelectionDialogTarget,
  TNode extends CanvasSelectionNode,
>(
  activeToolDialog: TDialog | null,
  nodes: readonly TNode[],
): TDialog | null {
  if (!activeToolDialog) {
    return null;
  }
  return nodes.some((node) => node.id === activeToolDialog.nodeId)
    ? activeToolDialog
    : null;
}
