// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  MAX_HISTORY_STEPS,
  createSnapshot,
  normalizeHistory,
  pushSnapshot,
  recordCanvasInteractionHistory,
  redoHistory,
  undoHistory,
  type CanvasHistorySnapshot,
} from './canvasHistory';
import type { CanvasEdge, CanvasNode } from './canvasNodes';

function snapshot(id: string): CanvasHistorySnapshot {
  return {
    nodes: [{ id } as CanvasNode],
    edges: [],
  };
}

describe('Canvas history', () => {
  it('keeps one snapshot per graph reference and caps the stack', () => {
    const nodes = [] as CanvasNode[];
    const edges = [] as CanvasEdge[];
    const current = createSnapshot(nodes, edges);
    const history = [current];
    const unchanged = pushSnapshot(history, createSnapshot(nodes, edges));

    expect(unchanged).toBe(history);
    expect(unchanged).toHaveLength(1);

    const full = Array.from({ length: MAX_HISTORY_STEPS }, (_, index) =>
      snapshot(`step-${index}`),
    );
    const next = pushSnapshot(full, snapshot('latest'));

    expect(next).toHaveLength(MAX_HISTORY_STEPS);
    expect(next[0]?.nodes[0]?.id).toBe('step-1');
    expect(next[next.length - 1]?.nodes[0]?.id).toBe('latest');
  });

  it('normalizes and limits restored history stacks', () => {
    const restored = normalizeHistory(
      {
        past: Array.from({ length: MAX_HISTORY_STEPS + 2 }, (_, index) =>
          snapshot(`past-${index}`),
        ),
        future: [snapshot('future')],
      },
      (nodes, edges) => ({ nodes: [...nodes], edges: [...edges] }),
    );

    expect(restored.past).toHaveLength(MAX_HISTORY_STEPS);
    expect(restored.past[0]?.nodes[0]?.id).toBe('past-2');
    expect(restored.future).toHaveLength(1);
  });

  it('moves snapshots between past and future without mutating the input', () => {
    const first = snapshot('first');
    const second = snapshot('second');
    const current = snapshot('current');
    const initial = { past: [first, second], future: [] };

    const undone = undoHistory(initial, current);
    expect(undone).toEqual({
      target: second,
      history: { past: [first], future: [current] },
    });
    expect(initial).toEqual({ past: [first, second], future: [] });

    const redone = redoHistory(undone!.history, undone!.target);
    expect(redone).toEqual({
      target: current,
      history: { past: [first, second], future: [] },
    });
  });

  it('returns null when no undo or redo target exists', () => {
    const empty = { past: [], future: [] };
    const current = snapshot('current');

    expect(undoHistory(empty, current)).toBeNull();
    expect(redoHistory(empty, current)).toBeNull();
  });

  it('captures one snapshot for a continuous drag and pushes it on interaction end', () => {
    const beforeDrag = snapshot('before-drag');
    const moved = recordCanvasInteractionHistory(
      { history: { past: [], future: [] }, dragHistorySnapshot: null },
      beforeDrag,
      {
        hasMeaningfulChange: true,
        hasInteractionMove: true,
        hasInteractionEnd: false,
      },
    );

    expect(moved).toEqual({
      history: { past: [], future: [] },
      dragHistorySnapshot: beforeDrag,
      editPushed: false,
    });

    const ended = recordCanvasInteractionHistory(
      moved,
      snapshot('drag-end'),
      {
        hasMeaningfulChange: true,
        hasInteractionMove: false,
        hasInteractionEnd: true,
      },
    );
    expect(ended).toEqual({
      history: { past: [beforeDrag], future: [] },
      dragHistorySnapshot: null,
      editPushed: true,
    });
  });
});
