// Copyright (c) 2026 AI anime
import type { CanvasClipboardSnapshot } from '../domain/canvasClipboard';

export interface CanvasClipboardSession<TNode, TEdge> {
  read(): CanvasClipboardSnapshot<TNode, TEdge> | null;
  write(snapshot: CanvasClipboardSnapshot<TNode, TEdge>): void;
}

export function createCanvasClipboardSession<TNode, TEdge>(): CanvasClipboardSession<
  TNode,
  TEdge
> {
  let snapshot: CanvasClipboardSnapshot<TNode, TEdge> | null = null;
  return {
    read: () => snapshot,
    write(nextSnapshot) {
      snapshot = nextSnapshot;
    },
  };
}
