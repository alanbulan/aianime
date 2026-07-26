// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SkillDefinition } from '@/features/freezone/context/skillRoles';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  useCanvasNodeMenuSelectionController,
  type CanvasNodeMenuSelectionControllerOptions,
} from './useCanvasNodeMenuSelectionController';

const skill: SkillDefinition = {
  id: 'skill-1',
  provider: 'tool',
  display_name: 'Test skill',
  description: '',
  inputs: [],
  outputs: [],
};

function node(id: string, type: CanvasNode['type']): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
  } as CanvasNode;
}

function createOptions(
  overrides: Partial<CanvasNodeMenuSelectionControllerOptions> = {},
) {
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
  const options: CanvasNodeMenuSelectionControllerOptions = {
    wrapperRef: { current: wrapperElement },
    nodes: [],
    flowPosition: { x: 100, y: 200 },
    menuPosition: { x: 30, y: 40 },
    menuAllowedTypes: undefined,
    pendingConnection: null,
    pendingBatchSourceIds: null,
    getLastCanvasPointerPosition: vi.fn(() => null),
    createNode: vi.fn(() => 'created-node'),
    beginNodePlacement: vi.fn(),
    connectSpawnedNode: vi.fn(),
    selectNode: vi.fn(),
    hideMenuForPlacement: vi.fn(),
    closeNodeMenu: vi.fn(),
    releasePaneClickSuppression: vi.fn(),
    ...overrides,
  };
  return options;
}

describe('useCanvasNodeMenuSelectionController', () => {
  it('starts plain-menu placement at the explicit selection position', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasNodeMenuSelectionController(options),
    );

    act(() => result.current.selectNodeType(
      CANVAS_NODE_TYPES.video,
      { x: 300, y: 400 },
    ));

    expect(options.hideMenuForPlacement).toHaveBeenCalledOnce();
    expect(options.beginNodePlacement).toHaveBeenCalledWith(
      { type: CANVAS_NODE_TYPES.video, initialData: undefined },
      { x: 300, y: 400 },
    );
    expect(options.getLastCanvasPointerPosition).not.toHaveBeenCalled();
    expect(options.selectNode).toHaveBeenCalledWith(null);
    expect(options.releasePaneClickSuppression).toHaveBeenCalledOnce();
    expect(options.createNode).not.toHaveBeenCalled();
  });

  it('uses the last pointer and then the menu coordinates for Skill placement', () => {
    const pointerOptions = createOptions({
      getLastCanvasPointerPosition: vi.fn(() => ({ x: 500, y: 600 })),
    });
    const pointerHook = renderHook(() =>
      useCanvasNodeMenuSelectionController(pointerOptions),
    );

    act(() => pointerHook.result.current.selectSkill(skill));

    expect(pointerOptions.beginNodePlacement).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CANVAS_NODE_TYPES.skill,
        skill,
        initialData: expect.objectContaining({
          skill_id: skill.id,
          displayName: skill.display_name,
        }),
      }),
      { x: 500, y: 600 },
    );

    const fallbackOptions = createOptions();
    const fallbackHook = renderHook(() =>
      useCanvasNodeMenuSelectionController(fallbackOptions),
    );
    act(() => fallbackHook.result.current.selectSkill(skill));

    expect(fallbackOptions.beginNodePlacement).toHaveBeenCalledWith(
      expect.any(Object),
      { x: 40, y: 60 },
    );
  });

  it('spawns and connects immediately when the menu has connection context', () => {
    const pendingConnection = {
      nodeId: 'origin',
      handleType: 'source' as const,
    };
    const options = createOptions({
      nodes: [node('origin', CANVAS_NODE_TYPES.imageGen)],
      pendingConnection,
    });
    const { result } = renderHook(() =>
      useCanvasNodeMenuSelectionController(options),
    );

    act(() => result.current.selectNodeType(CANVAS_NODE_TYPES.imageEdit));

    expect(options.createNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.imageEdit,
      { x: 100, y: 200 },
      {
        generationMode: 'image_reference',
        requestAspectRatio: 'auto',
      },
    );
    expect(options.connectSpawnedNode).toHaveBeenCalledWith({
      spawnedNodeId: 'created-node',
      pendingConnection,
      batchSourceIds: null,
    });
    expect(options.closeNodeMenu).toHaveBeenCalledOnce();
    expect(options.beginNodePlacement).not.toHaveBeenCalled();
  });

  it('uses immediate spawn for a batch-connection or filtered menu', () => {
    const options = createOptions({
      pendingBatchSourceIds: ['source-a', 'source-b'],
      menuAllowedTypes: [CANVAS_NODE_TYPES.video],
    });
    const { result } = renderHook(() =>
      useCanvasNodeMenuSelectionController(options),
    );

    act(() => result.current.selectNodeType(CANVAS_NODE_TYPES.video));

    expect(options.createNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.video,
      { x: 100, y: 200 },
      undefined,
    );
    expect(options.connectSpawnedNode).toHaveBeenCalledWith({
      spawnedNodeId: 'created-node',
      pendingConnection: null,
      batchSourceIds: ['source-a', 'source-b'],
    });
  });
});
