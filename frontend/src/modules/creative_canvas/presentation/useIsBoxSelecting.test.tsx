// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  createUseIsBoxSelecting,
  type CanvasBoxSelectionStore,
} from './useIsBoxSelecting';

function renderSelectionState(nodes: CanvasBoxSelectionStore['nodes']) {
  const useStore = <TSelected,>(
    selector: (state: CanvasBoxSelectionStore) => TSelected,
  ): TSelected => selector({ nodes });
  const useIsBoxSelecting = createUseIsBoxSelecting({ useStore });

  return renderHook(() => useIsBoxSelecting()).result.current;
}

describe('createUseIsBoxSelecting', () => {
  it.each([
    { nodes: [], expected: false },
    { nodes: [{ selected: true }], expected: false },
    {
      nodes: [{ selected: true }, { selected: false }, { selected: true }],
      expected: true,
    },
  ])('returns $expected for $nodes.length selected candidates', ({
    nodes,
    expected,
  }) => {
    expect(renderSelectionState(nodes)).toBe(expected);
  });
});
