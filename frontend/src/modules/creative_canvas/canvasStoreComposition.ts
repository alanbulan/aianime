// Copyright (c) 2026 AI anime
import { create } from 'zustand';

import type { StoryboardFrameItem } from './domain/storyboard';
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
} from './domain/canvasNodeData';
import {
  canvasNodeDefaultDataGateway,
  canvasNodeFactory,
} from './canvasNodeFactoryComposition';
import {
  createZustandCanvasViewportSlice,
  type CanvasViewportSlice,
} from './infrastructure/zustandCanvasViewportSlice';
import {
  createZustandCanvasTransientInteractionSlice,
  type CanvasTransientInteractionSlice,
} from './infrastructure/zustandCanvasTransientInteractionSlice';
import {
  createZustandCanvasHistorySlice,
  type CanvasHistorySlice,
} from './infrastructure/zustandCanvasHistorySlice';
import {
  createZustandCanvasGraphMutationSlice,
  type CanvasGraphMutationSlice,
} from './infrastructure/zustandCanvasGraphMutationSlice';
import {
  createZustandCanvasDocumentLifecycleSlice,
  type CanvasDocumentLifecycleSlice,
} from './infrastructure/zustandCanvasDocumentLifecycleSlice';
import {
  createZustandCanvasNodeMutationSlice,
  type CanvasNodeMutationSlice,
} from './infrastructure/zustandCanvasNodeMutationSlice';
import {
  createZustandCanvasDerivedNodeCreationSlice,
  type CanvasDerivedNodeCreationSlice,
} from './infrastructure/zustandCanvasDerivedNodeCreationSlice';
import {
  createZustandCanvasNodeDeletionSlice,
  type CanvasNodeDeletionSlice,
} from './infrastructure/zustandCanvasNodeDeletionSlice';
import {
  createZustandCanvasGroupLifecycleSlice,
  type CanvasGroupLifecycleSlice,
} from './infrastructure/zustandCanvasGroupLifecycleSlice';
import {
  createZustandCanvasStoryboardGroupSlice,
  type CanvasStoryboardGroupSlice,
} from './infrastructure/zustandCanvasStoryboardGroupSlice';
import {
  createZustandCanvasSelectionSlice,
  type CanvasSelectionSlice,
} from './infrastructure/zustandCanvasSelectionSlice';

export type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  StoryboardFrameItem,
};

export interface CanvasState
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
