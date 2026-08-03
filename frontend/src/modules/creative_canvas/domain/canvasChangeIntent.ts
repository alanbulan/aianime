// Copyright (c) 2026 AI anime

export interface CanvasNodeChangeLike {
  type: string;
  id?: string;
  dragging?: boolean;
  resizing?: boolean;
}

export interface CanvasNodeChangeIntent {
  resizedNodeIds: ReadonlySet<string>;
  hasMeaningfulChange: boolean;
  hasInteractionMove: boolean;
  hasInteractionEnd: boolean;
}

export function classifyCanvasNodeChanges(
  changes: readonly CanvasNodeChangeLike[],
): CanvasNodeChangeIntent {
  const resizedNodeIds = new Set(
    changes
      .filter(
        (change) =>
          change.type === 'dimensions'
          && change.resizing === false
          && typeof change.id === 'string',
      )
      .map((change) => change.id as string),
  );
  const hasMeaningfulChange = changes.some(
    (change) => change.type !== 'select' && change.type !== 'dimensions',
  );
  const hasDragMove = changes.some(
    (change) => change.type === 'position' && Boolean(change.dragging),
  );
  const hasDragEnd = changes.some(
    (change) => change.type === 'position' && change.dragging === false,
  );
  const hasResizeMove = changes.some(
    (change) => change.type === 'dimensions' && Boolean(change.resizing),
  );
  const hasResizeEnd = changes.some(
    (change) => change.type === 'dimensions' && change.resizing === false,
  );

  return {
    resizedNodeIds,
    hasMeaningfulChange,
    hasInteractionMove: hasDragMove || hasResizeMove,
    hasInteractionEnd: hasDragEnd || hasResizeEnd,
  };
}

export function hasMeaningfulCanvasEdgeChange(
  changes: readonly { type: string }[],
): boolean {
  return changes.some((change) => change.type !== 'select');
}
