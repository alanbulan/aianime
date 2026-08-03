// Copyright (c) 2026 AI anime
export interface StoryboardFrameLike {
  id: string;
  order: number;
}

export interface StoryboardFrameNodeProjection<TNode, TFrame> {
  frames: readonly TFrame[];
  replaceFrames(frames: TFrame[]): TNode;
}

export interface StoryboardFrameGraphPorts<TNode, TFrame> {
  projectNode(
    node: TNode,
  ): StoryboardFrameNodeProjection<TNode, TFrame> | null;
}

export interface StoryboardFrameGraphResult<TNode> {
  nodes: TNode[];
  changed: boolean;
}

export function updateStoryboardFrameInGraph<
  TNode extends { id: string },
  TFrame extends StoryboardFrameLike,
>(
  nodes: TNode[],
  nodeId: string,
  frameId: string,
  patch: Partial<TFrame>,
  ports: StoryboardFrameGraphPorts<TNode, TFrame>,
): StoryboardFrameGraphResult<TNode> {
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }
    const projection = ports.projectNode(node);
    if (!projection) {
      return node;
    }

    let nodeChanged = false;
    const nextFrames = projection.frames.map((frame) => {
      if (frame.id !== frameId) {
        return frame;
      }

      const patchEntries = Object.entries(patch) as Array<
        [keyof TFrame, TFrame[keyof TFrame]]
      >;
      if (
        patchEntries.every(([key, nextValue]) =>
          Object.is(frame[key], nextValue),
        )
      ) {
        return frame;
      }

      changed = true;
      nodeChanged = true;
      return {
        ...frame,
        ...patch,
      };
    });

    return nodeChanged
      ? projection.replaceFrames(nextFrames)
      : node;
  });

  return {
    nodes: changed ? nextNodes : nodes,
    changed,
  };
}

export function reorderStoryboardFrameInGraph<
  TNode extends { id: string },
  TFrame extends StoryboardFrameLike,
>(
  nodes: TNode[],
  nodeId: string,
  draggedFrameId: string,
  targetFrameId: string,
  ports: StoryboardFrameGraphPorts<TNode, TFrame>,
): StoryboardFrameGraphResult<TNode> {
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }
    const projection = ports.projectNode(node);
    if (!projection) {
      return node;
    }

    const frames = [...projection.frames].sort((a, b) => a.order - b.order);
    const fromIndex = frames.findIndex((frame) => frame.id === draggedFrameId);
    const toIndex = frames.findIndex((frame) => frame.id === targetFrameId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return node;
    }

    changed = true;
    const [movedFrame] = frames.splice(fromIndex, 1);
    frames.splice(toIndex, 0, movedFrame);
    return projection.replaceFrames(
      frames.map((frame, index) => ({
        ...frame,
        order: index,
      })),
    );
  });

  return {
    nodes: changed ? nextNodes : nodes,
    changed,
  };
}
