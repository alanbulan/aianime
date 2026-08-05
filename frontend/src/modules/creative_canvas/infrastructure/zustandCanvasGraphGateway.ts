// Copyright (c) 2026 AI anime
import type { CanvasGraphGateway } from '../application/canvasGraphPorts';
import { useCanvasStore } from '../canvasStoreComposition';
export const zustandCanvasGraphGateway: CanvasGraphGateway = {
  getSnapshot() {
    const state = useCanvasStore.getState();
    return {
      edges: state.edges,
      nodes: state.nodes,
    };
  },

  addNode(type, position, data) {
    return useCanvasStore.getState().addNode(type, position, data);
  },

  addEdgeWithData(source, target, data, options) {
    return useCanvasStore
      .getState()
      .addEdgeWithData(source, target, data, options);
  },

  updateNodeData(nodeId, data) {
    useCanvasStore.getState().updateNodeData(nodeId, data);
  },
};
