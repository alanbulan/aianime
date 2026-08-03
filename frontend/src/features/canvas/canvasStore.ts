// Copyright (c) 2026 AI anime
import { create } from 'zustand';

import {
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
} from '@/features/canvas/domain/canvasNodes';
import type { StoryboardFrameItem } from '@/modules/creative_canvas/public';
import {
  canvasNodeDefaultDataGateway,
  canvasNodeFactory,
} from '@/features/canvas/nodeFactoryComposition';
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
import {
  createZustandCanvasSelectionSlice,
  type CanvasSelectionSlice,
} from '@/features/canvas/infrastructure/zustandCanvasSelectionSlice';

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
