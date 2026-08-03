// Copyright (c) 2026 AI anime
import { useCallback, useRef } from 'react';

import type { CanvasClipboardSession } from '../application/canvasClipboardSession';
import type { CanvasClipboardSnapshot } from '../domain/canvasClipboard';

export interface CanvasNodeClipboardOptions<TNode, TEdge> {
  session: CanvasClipboardSession<TNode, TEdge>;
  createSnapshot: () => CanvasClipboardSnapshot<TNode, TEdge> | null;
  pasteSnapshot: (
    snapshot: CanvasClipboardSnapshot<TNode, TEdge>,
    targetPosition?: { x: number; y: number },
  ) => void;
  queueSnapshotPaste: (pasteSnapshot: () => void) => void;
  resetPasteIteration: () => void;
  clearSystemClipboard: () => Promise<void>;
}

export interface CanvasNodeClipboardController {
  hasCopiedNodes: () => boolean;
  copySelection: () => void;
  pasteSelection: () => void;
  pasteAt: (position: { x: number; y: number }) => void;
}

export function useCanvasNodeClipboard<TNode, TEdge>({
  session,
  createSnapshot,
  pasteSnapshot,
  queueSnapshotPaste,
  resetPasteIteration,
  clearSystemClipboard,
}: CanvasNodeClipboardOptions<TNode, TEdge>): CanvasNodeClipboardController {
  const snapshotRef = useRef<CanvasClipboardSnapshot<TNode, TEdge> | null>(
    session.read(),
  );

  const hasCopiedNodes = useCallback(
    () => (snapshotRef.current?.nodes.length ?? 0) > 0,
    [],
  );
  const copySelection = useCallback(() => {
    const snapshot = createSnapshot();
    if (!snapshot) {
      return;
    }
    snapshotRef.current = snapshot;
    session.write(snapshot);
    resetPasteIteration();
    void clearSystemClipboard().catch(() => undefined);
  }, [clearSystemClipboard, createSnapshot, resetPasteIteration, session]);
  const pasteSelection = useCallback(() => {
    queueSnapshotPaste(() => {
      const snapshot = snapshotRef.current;
      if (snapshot?.nodes.length) {
        pasteSnapshot(snapshot);
      }
    });
  }, [pasteSnapshot, queueSnapshotPaste]);
  const pasteAt = useCallback(
    (position: { x: number; y: number }) => {
      const snapshot = snapshotRef.current;
      if (snapshot?.nodes.length) {
        pasteSnapshot(snapshot, position);
      }
    },
    [pasteSnapshot],
  );

  return {
    hasCopiedNodes,
    copySelection,
    pasteSelection,
    pasteAt,
  };
}
