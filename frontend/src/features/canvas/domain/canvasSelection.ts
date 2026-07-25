// Copyright (c) 2026 AI anime
import type { ActiveToolDialog, CanvasNode } from './canvasNodes';

export function resolveSelectedNodeId(
  selectedNodeId: string | null,
  nodes: CanvasNode[],
): string | null {
  if (!selectedNodeId) {
    return null;
  }
  return nodes.some((node) => node.id === selectedNodeId) ? selectedNodeId : null;
}

export function resolveActiveToolDialog(
  activeToolDialog: ActiveToolDialog | null,
  nodes: CanvasNode[],
): ActiveToolDialog | null {
  if (!activeToolDialog) {
    return null;
  }
  return nodes.some((node) => node.id === activeToolDialog.nodeId)
    ? activeToolDialog
    : null;
}
