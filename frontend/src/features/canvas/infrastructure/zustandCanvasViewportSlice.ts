// Copyright (c) 2026 AI anime
import type { Viewport } from '@xyflow/react';

import {
  createClosedCanvasImageViewer,
  navigateCanvasImageViewer,
  openCanvasImageViewer,
  type CanvasImageViewerDirection,
  type CanvasImageViewerState,
} from '@/modules/creative_canvas/public';
import { findAvailableNodePosition } from '../domain/canvasGeometry';
import type { CanvasNode } from '../domain/canvasNodes';
import {
  createEmptyBookmarks,
  normalizeBookmarks,
  replaceViewportBookmark,
  type ViewportBookmark,
  type ViewportBookmarks,
} from '../domain/viewportBookmarks';

export interface CanvasViewportSlice {
  currentViewport: Viewport;
  canvasViewportSize: { width: number; height: number };
  /** 10 fixed slots (index 0..9 -> digit 1..9,0), persisted outside undo history. */
  viewportBookmarks: ViewportBookmarks;
  imageViewer: CanvasImageViewerState;
  setViewportState: (viewport: Viewport) => void;
  setViewportBookmark: (
    index: number,
    bookmark: ViewportBookmark | null,
  ) => void;
  clearViewportBookmarks: () => void;
  hydrateViewportBookmarks: (list: unknown) => void;
  setCanvasViewportSize: (size: { width: number; height: number }) => void;
  openImageViewer: (imageUrl: string, imageList?: string[]) => void;
  closeImageViewer: () => void;
  navigateImageViewer: (direction: CanvasImageViewerDirection) => void;
  findNodePosition: (
    sourceNodeId: string,
    newNodeWidth: number,
    newNodeHeight: number,
  ) => { x: number; y: number };
}

interface CanvasViewportSliceState extends CanvasViewportSlice {
  nodes: CanvasNode[];
}

interface CanvasViewportSliceStore {
  getState: () => CanvasViewportSliceState;
  setState: (patch: Partial<CanvasViewportSlice>) => void;
}

export function createZustandCanvasViewportSlice(
  store: CanvasViewportSliceStore,
): CanvasViewportSlice {
  return {
    currentViewport: { x: 0, y: 0, zoom: 1 },
    canvasViewportSize: { width: 0, height: 0 },
    viewportBookmarks: createEmptyBookmarks(),
    imageViewer: createClosedCanvasImageViewer(),

    setViewportState(viewport) {
      store.setState({ currentViewport: viewport });
    },

    setViewportBookmark(index, bookmark) {
      const current = store.getState().viewportBookmarks;
      const next = replaceViewportBookmark(current, index, bookmark);
      if (next !== current) {
        store.setState({ viewportBookmarks: next });
      }
    },

    clearViewportBookmarks() {
      store.setState({ viewportBookmarks: createEmptyBookmarks() });
    },

    hydrateViewportBookmarks(list) {
      store.setState({ viewportBookmarks: normalizeBookmarks(list) });
    },

    setCanvasViewportSize(size) {
      store.setState({ canvasViewportSize: size });
    },

    openImageViewer(imageUrl, imageList = []) {
      store.setState({
        imageViewer: openCanvasImageViewer(imageUrl, imageList),
      });
    },

    closeImageViewer() {
      store.setState({ imageViewer: createClosedCanvasImageViewer() });
    },

    navigateImageViewer(direction) {
      const current = store.getState().imageViewer;
      const next = navigateCanvasImageViewer(current, direction);
      if (next !== current) {
        store.setState({ imageViewer: next });
      }
    },

    findNodePosition(sourceNodeId, newNodeWidth, newNodeHeight) {
      const state = store.getState();
      return findAvailableNodePosition({
        nodes: state.nodes,
        sourceNodeId,
        newNodeWidth,
        newNodeHeight,
        viewport: state.currentViewport,
        viewportSize: state.canvasViewportSize,
      });
    },
  };
}
