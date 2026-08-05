// Copyright (c) 2026 AI anime
import { useCanvasStore } from '@/features/canvas/canvasStore';



import type { CanvasGraphGateway } from "@/modules/creative_canvas/public";
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
