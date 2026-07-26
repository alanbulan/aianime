// Copyright (c) 2026 AI anime
import type { ActiveToolDialog } from '../domain/canvasNodes';

export interface CanvasSelectionSlice {
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  setSelectedNode: (nodeId: string | null) => void;
  openToolDialog: (dialog: ActiveToolDialog) => void;
  closeToolDialog: () => void;
}

interface CanvasSelectionSliceDependencies {
  setState: (patch: Partial<CanvasSelectionSlice>) => void;
}

export function createZustandCanvasSelectionSlice(
  dependencies: CanvasSelectionSliceDependencies,
): CanvasSelectionSlice {
  return {
    selectedNodeId: null,
    activeToolDialog: null,

    setSelectedNode(nodeId) {
      dependencies.setState({ selectedNodeId: nodeId });
    },

    openToolDialog(dialog) {
      dependencies.setState({ activeToolDialog: dialog });
    },

    closeToolDialog() {
      dependencies.setState({ activeToolDialog: null });
    },
  };
}
