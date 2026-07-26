// Copyright (c) 2026 AI anime

export interface CanvasTransientInteractionSlice {
  /** The node whose secondary tool overlay currently takes display priority. */
  activeOverlayNodeId: string | null;
  /** The node currently targeted by hover-only Canvas controls. */
  hoveredNodeId: string | null;
  /** One-shot focus request consumed and cleared by Canvas. */
  pendingFocusNodeId: string | null;
  setActiveOverlayNodeId: (nodeId: string | null) => void;
  setHoveredNodeId: (nodeId: string | null) => void;
  requestFocusNode: (nodeId: string) => void;
  clearPendingFocus: () => void;
}

interface CanvasTransientInteractionSliceStore {
  getState: () => CanvasTransientInteractionSlice;
  setState: (patch: Partial<CanvasTransientInteractionSlice>) => void;
}

export function createZustandCanvasTransientInteractionSlice(
  store: CanvasTransientInteractionSliceStore,
): CanvasTransientInteractionSlice {
  return {
    activeOverlayNodeId: null,
    hoveredNodeId: null,
    pendingFocusNodeId: null,

    setActiveOverlayNodeId(nodeId) {
      if (store.getState().activeOverlayNodeId !== nodeId) {
        store.setState({ activeOverlayNodeId: nodeId });
      }
    },

    setHoveredNodeId(nodeId) {
      if (store.getState().hoveredNodeId !== nodeId) {
        store.setState({ hoveredNodeId: nodeId });
      }
    },

    requestFocusNode(nodeId) {
      store.setState({ pendingFocusNodeId: nodeId });
    },

    clearPendingFocus() {
      store.setState({ pendingFocusNodeId: null });
    },
  };
}
