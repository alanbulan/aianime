// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  isCanvasMutationState,
  isDeleteToEmpty,
  trackEdit,
} from './canvasMutation';

describe('Canvas mutation state', () => {
  it('increments user edits and records the default source', () => {
    const state = { userEditsSinceHydrate: 2 };

    expect(trackEdit(state)).toEqual({
      userEditsSinceHydrate: 3,
      lastMutationSource: 'user_edit',
    });
    expect(state).toEqual({ userEditsSinceHydrate: 2 });
  });

  it('records an explicit clear source', () => {
    expect(trackEdit({ userEditsSinceHydrate: 0 }, 'manual_clear')).toEqual({
      userEditsSinceHydrate: 1,
      lastMutationSource: 'manual_clear',
    });
  });

  it('recognizes only a transition from non-empty to empty', () => {
    expect(isDeleteToEmpty(1, 0)).toBe(true);
    expect(isDeleteToEmpty(0, 0)).toBe(false);
    expect(isDeleteToEmpty(2, 1)).toBe(false);
  });

  it('validates persisted mutation state', () => {
    expect(
      isCanvasMutationState({
        userEditsSinceHydrate: 1,
        lastMutationSource: 'delete_to_empty',
        pendingClearIntent: false,
      }),
    ).toBe(true);
    expect(
      isCanvasMutationState({
        userEditsSinceHydrate: 1,
        lastMutationSource: 'unknown',
        pendingClearIntent: false,
      }),
    ).toBe(false);
  });
});
