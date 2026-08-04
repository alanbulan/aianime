// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UI_POPOVER_TRANSITION_MS } from '@/components/ui/motion';
import type { SkillDefinition } from '../domain/skillContract';
import { NODE_SELECTION_MENU_NODE_TYPES } from '../domain/nodeSelectionMenuModel';
import { useNodeSelectionMenuController } from './useNodeSelectionMenuController';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function skill(id: string): SkillDefinition {
  return {
    id,
    provider: 'tool',
    display_name: id,
    description: '',
    inputs: [],
    outputs: [],
  };
}

describe('useNodeSelectionMenuController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
    );
    vi.stubGlobal('cancelAnimationFrame', (frame: number) => {
      window.clearTimeout(frame);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('delays node selection until the close transition completes', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const { result } = renderHook(() => useNodeSelectionMenuController({
      position: { x: 20, y: 30 },
      onClose,
      onSelect,
    }));

    act(() => result.current.selectNode(
      NODE_SELECTION_MENU_NODE_TYPES.video,
      { x: 40, y: 50 },
    ));
    expect(onClose).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(UI_POPOVER_TRANSITION_MS));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(10));
    expect(onSelect).toHaveBeenCalledWith(
      NODE_SELECTION_MENU_NODE_TYPES.video,
      { x: 40, y: 50 },
    );
  });

  it('opens and closes the active skill provider with the hover delay', () => {
    const item = skill('tool.visible');
    const { result } = renderHook(() => useNodeSelectionMenuController({
      position: { x: 20, y: 30 },
      onClose: vi.fn(),
      onSelect: vi.fn(),
      skillItems: [item],
      onSelectSkill: vi.fn(),
    }));

    act(() => result.current.showSkillProvider('tool'));
    expect(result.current.activeSkillGroup?.items).toEqual([item]);

    act(() => result.current.scheduleSkillPanelClose());
    act(() => vi.advanceTimersByTime(39));
    expect(result.current.activeSkillProvider).toBe('tool');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.activeSkillProvider).toBeNull();
  });

  it('selects skills immediately and closes after the transition', () => {
    const item = skill('tool.visible');
    const onClose = vi.fn();
    const onSelectSkill = vi.fn();
    const { result } = renderHook(() => useNodeSelectionMenuController({
      position: { x: 20, y: 30 },
      onClose,
      onSelect: vi.fn(),
      skillItems: [item],
      onSelectSkill,
    }));

    act(() => result.current.selectSkill(item));
    expect(onSelectSkill).toHaveBeenCalledWith(item);
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(UI_POPOVER_TRANSITION_MS));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes when a pointer press starts outside the menu', () => {
    const onClose = vi.fn();
    renderHook(() => useNodeSelectionMenuController({
      position: { x: 20, y: 30 },
      onClose,
      onSelect: vi.fn(),
    }));

    act(() => document.body.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
    })));
    act(() => vi.advanceTimersByTime(UI_POPOVER_TRANSITION_MS));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
