// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SkillDefinition } from '@/features/freezone/context/skillRoles';

import { useCanvasSkillRegistry } from './useCanvasSkillRegistry';

function skill(id: string): SkillDefinition {
  return { id } as SkillDefinition;
}

describe('useCanvasSkillRegistry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads skills and builds the id projection', async () => {
    const first = skill('skill-1');
    const second = skill('skill-2');
    const loadSkillRegistry = vi.fn().mockResolvedValue([first, second]);

    const { result } = renderHook(() =>
      useCanvasSkillRegistry(loadSkillRegistry),
    );

    expect(result.current.skills).toEqual([]);
    await waitFor(() => expect(result.current.skills).toEqual([first, second]));
    expect(result.current.skillById.get('skill-1')).toBe(first);
    expect(result.current.skillById.get('skill-2')).toBe(second);
    expect(loadSkillRegistry).toHaveBeenCalledOnce();
  });

  it('keeps the registry empty and reports load failures', async () => {
    const error = new Error('registry unavailable');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const loadSkillRegistry = vi.fn().mockRejectedValue(error);

    const { result } = renderHook(() =>
      useCanvasSkillRegistry(loadSkillRegistry),
    );

    await waitFor(() => expect(warn).toHaveBeenCalledWith(
      '[SkillNode] failed to load skill registry for canvas connections',
      error,
    ));
    expect(result.current.skills).toEqual([]);
    expect(result.current.skillById.size).toBe(0);
  });

  it('ignores a response that arrives after unmount', async () => {
    let resolveRegistry: ((skills: SkillDefinition[]) => void) | null = null;
    const loadSkillRegistry = vi.fn(() =>
      new Promise<SkillDefinition[]>((resolve) => {
        resolveRegistry = resolve;
      }),
    );
    const { unmount } = renderHook(() =>
      useCanvasSkillRegistry(loadSkillRegistry),
    );

    unmount();
    await act(async () => resolveRegistry?.([skill('late-skill')]));
    expect(loadSkillRegistry).toHaveBeenCalledOnce();
  });
});
