// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useStoryboardGroupToolbarController } from './useStoryboardGroupToolbarController';

describe('useStoryboardGroupToolbarController', () => {
  it('projects defaults and clamps the selectable grid columns', () => {
    const { result, rerender } = renderHook(
      ({ childCount, requestedCols }: { childCount: number; requestedCols?: number }) =>
        useStoryboardGroupToolbarController({
          groupNodeId: 'group-a',
          childCount,
          requestedCols,
          translate: (key) => key,
          configureGroup: vi.fn(),
          convertGroupToPlain: vi.fn(),
          notifyStitchUnavailable: vi.fn(),
          ungroup: vi.fn(),
        }),
      {
        initialProps: {
          childCount: 8,
          requestedCols: 5 as number | undefined,
        },
      },
    );

    expect(result.current).toMatchObject({
      aspectKey: '16:9',
      currentCols: 5,
      showIndex: false,
      colOptions: [1, 2, 3, 4, 5, 6],
    });

    rerender({ childCount: 0, requestedCols: undefined });
    expect(result.current.currentCols).toBe(1);
    expect(result.current.colOptions).toEqual([1]);
  });

  it('routes every toolbar command through the supplied ports', () => {
    const configureGroup = vi.fn();
    const convertGroupToPlain = vi.fn();
    const notifyStitchUnavailable = vi.fn();
    const ungroup = vi.fn();
    const { result } = renderHook(() =>
      useStoryboardGroupToolbarController({
        groupNodeId: 'group-a',
        childCount: 3,
        aspectKey: '4:3',
        requestedCols: 2,
        showIndex: true,
        translate: (key) => key,
        configureGroup,
        convertGroupToPlain,
        notifyStitchUnavailable,
        ungroup,
      }),
    );

    act(() => {
      result.current.setAspect('1:1');
      result.current.setCols(3);
      result.current.toggleIndex();
      result.current.requestStitch();
      result.current.convertToPlain();
      result.current.ungroup();
    });

    expect(configureGroup).toHaveBeenNthCalledWith(1, 'group-a', {
      aspectKey: '1:1',
    });
    expect(configureGroup).toHaveBeenNthCalledWith(2, 'group-a', { cols: 3 });
    expect(configureGroup).toHaveBeenNthCalledWith(3, 'group-a', {
      showIndex: false,
    });
    expect(notifyStitchUnavailable).toHaveBeenCalledOnce();
    expect(convertGroupToPlain).toHaveBeenCalledWith('group-a');
    expect(ungroup).toHaveBeenCalledWith('group-a');
  });
});
