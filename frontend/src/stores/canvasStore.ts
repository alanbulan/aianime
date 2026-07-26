// Copyright (c) 2026 AI anime
import { create } from 'zustand';

import {
  type ActiveToolDialog,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
  type NodeToolType,
  type StoryboardFrameItem,
} from '@/features/canvas/domain/canvasNodes';
import { canvasNodeFactory } from '@/features/canvas/nodeFactoryComposition';
import {
  createZustandCanvasViewportSlice,
  type CanvasViewportSlice,
} from '@/features/canvas/infrastructure/zustandCanvasViewportSlice';
import {
  createZustandCanvasTransientInteractionSlice,
  type CanvasTransientInteractionSlice,
} from '@/features/canvas/infrastructure/zustandCanvasTransientInteractionSlice';
import {
  createZustandCanvasHistorySlice,
  type CanvasHistorySlice,
} from '@/features/canvas/infrastructure/zustandCanvasHistorySlice';
import {
  createZustandCanvasGraphMutationSlice,
  type CanvasGraphMutationSlice,
} from '@/features/canvas/infrastructure/zustandCanvasGraphMutationSlice';
import {
  createZustandCanvasDocumentLifecycleSlice,
  type CanvasDocumentLifecycleSlice,
} from '@/features/canvas/infrastructure/zustandCanvasDocumentLifecycleSlice';
import {
  createZustandCanvasNodeMutationSlice,
  type CanvasNodeMutationSlice,
} from '@/features/canvas/infrastructure/zustandCanvasNodeMutationSlice';
import {
  createZustandCanvasDerivedNodeCreationSlice,
  type CanvasDerivedNodeCreationSlice,
} from '@/features/canvas/infrastructure/zustandCanvasDerivedNodeCreationSlice';
import {
  createZustandCanvasNodeDeletionSlice,
  type CanvasNodeDeletionSlice,
} from '@/features/canvas/infrastructure/zustandCanvasNodeDeletionSlice';
import {
  createZustandCanvasGroupLifecycleSlice,
  type CanvasGroupLifecycleSlice,
} from '@/features/canvas/infrastructure/zustandCanvasGroupLifecycleSlice';
import {
  createZustandCanvasStoryboardGroupSlice,
  type CanvasStoryboardGroupSlice,
} from '@/features/canvas/infrastructure/zustandCanvasStoryboardGroupSlice';

export type {
  ActiveToolDialog,
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  NodeToolType,
  StoryboardFrameItem,
};

interface CanvasState
  extends CanvasViewportSlice,
    CanvasTransientInteractionSlice,
    CanvasHistorySlice,
    CanvasGraphMutationSlice,
    CanvasDocumentLifecycleSlice,
    CanvasNodeMutationSlice,
    CanvasDerivedNodeCreationSlice,
    CanvasNodeDeletionSlice,
    CanvasGroupLifecycleSlice,
    CanvasStoryboardGroupSlice {
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;

  setSelectedNode: (nodeId: string | null) => void;

  openToolDialog: (dialog: ActiveToolDialog) => void;
  closeToolDialog: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  selectedNodeId: null,
  activeToolDialog: null,
  ...createZustandCanvasViewportSlice({
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasTransientInteractionSlice({
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasHistorySlice({
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasGraphMutationSlice({
    getState: get,
    setState: (patch) => set(patch),
    updateState: (update) => set((state) => update(state)),
  }),
  ...createZustandCanvasDocumentLifecycleSlice({
    setState: (patch) => set(patch),
    updateState: (update) => set((state) => update(state)),
  }),
  ...createZustandCanvasNodeMutationSlice({
    nodeFactory: canvasNodeFactory,
    getState: get,
    setState: (patch) => set(patch),
    updateState: (update) => set((state) => update(state)),
  }),
  ...createZustandCanvasDerivedNodeCreationSlice({
    nodeFactory: canvasNodeFactory,
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasNodeDeletionSlice({
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasGroupLifecycleSlice({
    nodeFactory: canvasNodeFactory,
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasStoryboardGroupSlice({
    nodeFactory: canvasNodeFactory,
    getState: get,
    setState: (patch) => set(patch),
  }),

  setSelectedNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  openToolDialog: (dialog) => {
    set({ activeToolDialog: dialog });
  },

  closeToolDialog: () => {
    set({ activeToolDialog: null });
  },
}));

/**
 * True while a box-selection spans 2+ nodes. Node components use this to hide
 * their per-node bottom ops panel during a multi-select (the panels only make
 * sense for a single, intentionally-clicked node and otherwise clutter the
 * canvas). The selector returns a boolean so subscribers only re-render when
 * the multi-select state actually flips.
 */
export function useIsBoxSelecting(): boolean {
  return useCanvasStore((state) => {
    let count = 0;
    for (const node of state.nodes) {
      if (node.selected) {
        count += 1;
        if (count > 1) {
          return true;
        }
      }
    }
    return false;
  });
}
