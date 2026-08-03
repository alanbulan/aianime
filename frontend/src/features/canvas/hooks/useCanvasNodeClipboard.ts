// Copyright (c) 2026 AI anime
import { useCallback, useRef } from 'react';

import type { CanvasClipboardSnapshot } from '@/modules/creative_canvas/public';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';

type CanvasNodeClipboardSnapshot = CanvasClipboardSnapshot<CanvasNode, CanvasEdge>;

let sharedCanvasNodeClipboard: CanvasNodeClipboardSnapshot | null = null;

export interface CanvasNodeClipboardOptions {
  createSnapshot: () => CanvasNodeClipboardSnapshot | null;
  pasteSnapshot: (
    snapshot: CanvasNodeClipboardSnapshot,
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

export function useCanvasNodeClipboard({
  createSnapshot,
  pasteSnapshot,
  queueSnapshotPaste,
  resetPasteIteration,
  clearSystemClipboard,
}: CanvasNodeClipboardOptions): CanvasNodeClipboardController {
  const snapshotRef = useRef<CanvasNodeClipboardSnapshot | null>(
    sharedCanvasNodeClipboard,
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
    sharedCanvasNodeClipboard = snapshot;
    resetPasteIteration();
    void clearSystemClipboard().catch(() => undefined);
  }, [clearSystemClipboard, createSnapshot, resetPasteIteration]);
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
