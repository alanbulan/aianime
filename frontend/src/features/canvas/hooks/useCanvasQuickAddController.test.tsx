// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SkillDefinition } from '@/features/freezone/public';

import { CANVAS_NODE_TYPES } from '../domain/canvasNodes';
import {
  useCanvasQuickAddController,
  type CanvasQuickAddControllerOptions,
} from './useCanvasQuickAddController';

const skill: SkillDefinition = {
  id: 'skill-1',
  provider: 'tool',
  display_name: 'Test skill',
  description: '',
  inputs: [],
  outputs: [],
};

function createOptions(
  wrapperElement: HTMLDivElement | null,
): CanvasQuickAddControllerOptions {
  return {
    wrapperRef: { current: wrapperElement },
    screenToFlowPosition: vi.fn(({ x, y }) => ({ x: x / 2, y: y / 2 })),
    createNode: vi.fn(() => 'new-node'),
    selectNode: vi.fn(),
    bindSkill: vi.fn(),
  };
}

describe('useCanvasQuickAddController', () => {
  it('adds and selects a node at the wrapper viewport center', () => {
    const wrapperElement = document.createElement('div');
    vi.spyOn(wrapperElement, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      right: 410,
      bottom: 320,
      width: 400,
      height: 300,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    const options = createOptions(wrapperElement);
    const { result } = renderHook(() =>
      useCanvasQuickAddController(options),
    );

    act(() => result.current.quickAddNode(CANVAS_NODE_TYPES.video));

    expect(options.screenToFlowPosition).toHaveBeenCalledWith({ x: 210, y: 170 });
    expect(options.createNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.video,
      { x: 105, y: 85 },
    );
    expect(options.selectNode).toHaveBeenCalledWith('new-node');
  });

  it('falls back to the browser center when the wrapper is unavailable', () => {
    const options = createOptions(null);
    const { result } = renderHook(() =>
      useCanvasQuickAddController(options),
    );

    const center = result.current.getViewportCenter();

    expect(options.screenToFlowPosition).toHaveBeenCalledWith({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    expect(center).toEqual({
      x: window.innerWidth / 4,
      y: window.innerHeight / 4,
    });
  });

  it('creates, selects, and binds a Skill node through shared application data', () => {
    const options = createOptions(null);
    const { result } = renderHook(() =>
      useCanvasQuickAddController(options),
    );

    act(() => result.current.quickAddSkill(skill));

    expect(options.createNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.skill,
      {
        x: window.innerWidth / 4,
        y: window.innerHeight / 4,
      },
      expect.objectContaining({
        skill_id: skill.id,
        displayName: skill.display_name,
      }),
    );
    expect(options.selectNode).toHaveBeenCalledWith('new-node');
    expect(options.bindSkill).toHaveBeenCalledWith('new-node', skill);
  });
});
