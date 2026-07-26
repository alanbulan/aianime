// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SkillDefinition } from '@/features/freezone/context/skillRoles';

import { CANVAS_NODE_TYPES } from '../domain/canvasNodes';
import {
  useCanvasNodePlacementController,
  type CanvasNodePlacementControllerOptions,
} from './useCanvasNodePlacementController';

function wrapperElement(): HTMLDivElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({
    left: 10,
    top: 20,
    width: 800,
    height: 600,
    right: 810,
    bottom: 620,
    x: 10,
    y: 20,
    toJSON: () => ({}),
  });
  return element;
}

function createOptions(): CanvasNodePlacementControllerOptions {
  return {
    wrapperRef: { current: wrapperElement() },
    screenToFlowPosition: vi.fn(({ x, y }) => ({ x: x / 2, y: y / 2 })),
    createNode: vi.fn(() => 'created'),
    selectNode: vi.fn(),
    bindSkill: vi.fn(),
    confirmPlacement: vi.fn(),
    suppressNextPaneClick: vi.fn(),
    resolvePlacementLabel: vi.fn(() => 'Skill label'),
  };
}

describe('useCanvasNodePlacementController', () => {
  it('owns placement state and projects the preview inside the wrapper', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasNodePlacementController(options));

    act(() => result.current.beginNodePlacement(
      { type: CANVAS_NODE_TYPES.video },
      { x: 330, y: 220 },
    ));

    expect(result.current.placementActive).toBe(true);
    expect(result.current.placementPreview).toEqual({
      left: 160,
      top: 100,
      width: 320,
      height: 200,
      label: 'Skill label',
    });
    expect(options.resolvePlacementLabel).toHaveBeenCalledWith({
      type: CANVAS_NODE_TYPES.video,
    });

    act(() => result.current.cancelNodePlacement());
    expect(result.current.placementActive).toBe(false);
    expect(result.current.placementPreview).toBeNull();
  });

  it('creates, selects, binds and confirms a placed Skill node', () => {
    const options = createOptions();
    const skill: SkillDefinition = {
      id: 'skill-1',
      provider: 'tool',
      display_name: 'Test skill',
      description: '',
      inputs: [],
      outputs: [],
    };
    const initialData = { skill_id: skill.id };
    const { result } = renderHook(() =>
      useCanvasNodePlacementController(options));

    act(() => result.current.beginNodePlacement(
      { type: CANVAS_NODE_TYPES.skill, initialData, skill },
      null,
    ));
    let committed = false;
    act(() => {
      committed = result.current.commitNodePlacementAtClientPosition({
        x: 400,
        y: 300,
      });
    });

    expect(committed).toBe(true);
    expect(options.screenToFlowPosition).toHaveBeenCalledWith({ x: 240, y: 200 });
    expect(options.createNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.skill,
      { x: 120, y: 100 },
      initialData,
    );
    expect(options.selectNode).toHaveBeenCalledWith('created');
    expect(options.bindSkill).toHaveBeenCalledWith('created', skill);
    expect(options.confirmPlacement).toHaveBeenCalledWith('created');
    expect(options.suppressNextPaneClick).toHaveBeenCalledOnce();
    expect(result.current.placementActive).toBe(false);
  });

  it('ignores commits without an active placement', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasNodePlacementController(options));

    expect(result.current.commitNodePlacementAtClientPosition({
      x: 100,
      y: 100,
    })).toBe(false);
    expect(options.createNode).not.toHaveBeenCalled();
  });
});
