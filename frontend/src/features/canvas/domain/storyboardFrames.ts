// Copyright (c) 2026 AI anime
import {
  isStoryboardSplitNode,
  type CanvasNode,
  type StoryboardFrameItem,
} from './canvasNodes';

export interface StoryboardFrameGraphResult {
  nodes: CanvasNode[];
  changed: boolean;
}

export function updateStoryboardFrameInGraph(
  nodes: CanvasNode[],
  nodeId: string,
  frameId: string,
  patch: Partial<StoryboardFrameItem>,
): StoryboardFrameGraphResult {
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId || !isStoryboardSplitNode(node)) {
      return node;
    }

    let nodeChanged = false;
    const nextFrames = node.data.frames.map((frame) => {
      if (frame.id !== frameId) {
        return frame;
      }

      const patchEntries = Object.entries(patch) as Array<
        [keyof StoryboardFrameItem, StoryboardFrameItem[keyof StoryboardFrameItem]]
      >;
      if (patchEntries.every(([key, nextValue]) => Object.is(frame[key], nextValue))) {
        return frame;
      }

      changed = true;
      nodeChanged = true;
      return {
        ...frame,
        ...patch,
      };
    });

    if (!nodeChanged) {
      return node;
    }
    return {
      ...node,
      data: {
        ...node.data,
        frames: nextFrames,
      },
    };
  });

  return {
    nodes: changed ? nextNodes : nodes,
    changed,
  };
}

export function reorderStoryboardFrameInGraph(
  nodes: CanvasNode[],
  nodeId: string,
  draggedFrameId: string,
  targetFrameId: string,
): StoryboardFrameGraphResult {
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId || !isStoryboardSplitNode(node)) {
      return node;
    }

    const frames = [...node.data.frames].sort((a, b) => a.order - b.order);
    const fromIndex = frames.findIndex((frame) => frame.id === draggedFrameId);
    const toIndex = frames.findIndex((frame) => frame.id === targetFrameId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return node;
    }

    changed = true;
    const [movedFrame] = frames.splice(fromIndex, 1);
    frames.splice(toIndex, 0, movedFrame);
    return {
      ...node,
      data: {
        ...node.data,
        frames: frames.map((frame, index) => ({
          ...frame,
          order: index,
        })),
      },
    };
  });

  return {
    nodes: changed ? nextNodes : nodes,
    changed,
  };
}
