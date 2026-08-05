// Copyright (c) 2026 AI anime
import { create } from 'zustand';

;
import type { StoryboardFrameItem, CanvasEdge, CanvasNode, CanvasNodeData, CanvasNodeType } from '@/modules/creative_canvas/public';
import {
  canvasNodeDefaultDataGateway,
  canvasNodeFactory,
} from '@/modules/creative_canvas/public';
import {
  createZustandCanvasViewportSlice,
  type CanvasViewportSlice,
} from '@/modules/creative_canvas/infrastructure/zustandCanvasViewportSlice';
import {
  createZustandCanvasTransientInteractionSlice,
  type CanvasTransientInteractionSlice,
} from '@/modules/creative_canvas/infrastructure/zustandCanvasTransientInteractionSlice';
import {
  createZustandCanvasHistorySlice,
  type CanvasHistorySlice,
} from '@/modules/creative_canvas/infrastructure/zustandCanvasHistorySlice';
import {
  createZustandCanvasGraphMutationSlice,
  type CanvasGraphMutationSlice,
} from '@/modules/creative_canvas/infrastructure/zustandCanvasGraphMutationSlice';
import {
  createZustandCanvasDocumentLifecycleSlice,
  type CanvasDocumentLifecycleSlice,
} from '@/modules/creative_canvas/infrastructure/zustandCanvasDocumentLifecycleSlice';
import {
  createZustandCanvasNodeMutationSlice,
  type CanvasNodeMutationSlice,
} from '@/modules/creative_canvas/infrastructure/zustandCanvasNodeMutationSlice';
import {
  createZustandCanvasDerivedNodeCreationSlice,
  type CanvasDerivedNodeCreationSlice,
} from '@/modules/creative_canvas/infrastructure/zustandCanvasDerivedNodeCreationSlice';
import {
  createZustandCanvasNodeDeletionSlice,
  type CanvasNodeDeletionSlice,
} from '@/modules/creative_canvas/infrastructure/zustandCanvasNodeDeletionSlice';
import {
  createZustandCanvasGroupLifecycleSlice,
  type CanvasGroupLifecycleSlice,
} from '@/modules/creative_canvas/infrastructure/zustandCanvasGroupLifecycleSlice';
import {
  createZustandCanvasStoryboardGroupSlice,
  type CanvasStoryboardGroupSlice,
} from '@/modules/creative_canvas/infrastructure/zustandCanvasStoryboardGroupSlice';
import {
  createZustandCanvasSelectionSlice,
  type CanvasSelectionSlice,
} from '@/modules/creative_canvas/infrastructure/zustandCanvasSelectionSlice';

export type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
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
    CanvasStoryboardGroupSlice,
    CanvasSelectionSlice {}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  ...createZustandCanvasSelectionSlice({
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasViewportSlice({
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasTransientInteractionSlice({
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasHistorySlice({
    nodeDefaultDataGateway: canvasNodeDefaultDataGateway,
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasGraphMutationSlice({
    getState: get,
    setState: (patch) => set(patch),
    updateState: (update) => set((state) => update(state)),
  }),
  ...createZustandCanvasDocumentLifecycleSlice({
    nodeDefaultDataGateway: canvasNodeDefaultDataGateway,
    setState: (patch) => set(patch),
    updateState: (update) => set((state) => update(state)),
  }),
  ...createZustandCanvasNodeMutationSlice({
    nodeDefaultDataGateway: canvasNodeDefaultDataGateway,
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
}));
