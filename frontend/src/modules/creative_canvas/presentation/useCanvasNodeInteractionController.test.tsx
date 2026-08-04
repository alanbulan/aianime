// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasNodeInteractionController,
  type CanvasNodeInteractionControllerOptions,
  type CanvasNodeInteractionNode,
} from './useCanvasNodeInteractionController';

type TestNodeType =
  | 'imageEdit'
  | 'imageGen'
  | 'skill'
  | 'storyboardGroup'
  | 'upload';

interface TestNodeData {
  [key: string]: unknown;
}

interface TestNode extends CanvasNodeInteractionNode {
  type: TestNodeType;
  data: TestNodeData;
}

type TestOptions = CanvasNodeInteractionControllerOptions<
  TestNodeType,
  TestNodeData,
  TestNode
>;

const TEST_NODE_TYPES = {
  imageEdit: 'imageEdit',
  upload: 'upload',
  imageGen: 'imageGen',
  skill: 'skill',
} as const;

function wrapperElement(): HTMLDivElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({
    left: 10,
    top: 20,
    width: 400,
    height: 300,
    right: 410,
    bottom: 320,
    x: 10,
    y: 20,
    toJSON: () => ({}),
  });
  return element;
}

function createOptions(): TestOptions {
  return {
    wrapperRef: { current: wrapperElement() },
    nodes: [],
    nodeTypes: TEST_NODE_TYPES,
    skillNodeType: 'skill',
    screenToFlowPosition: vi.fn(({ x, y }) => ({ x: x / 2, y: y / 2 })),
    createNode: vi.fn(() => 'node-1'),
    adaptMenuCreationData: (data) => ({ ...data }),
    selectNode: vi.fn(),
    bindSkill: vi.fn(),
    confirmPlacement: vi.fn(),
    resolvePlacementLabel: vi.fn(({ type }) => type),
    openPlainNodeMenu: vi.fn(),
    dismissNodeMenu: vi.fn(),
    centerViewport: vi.fn(),
    isStoryboardGroupNode: (node) => node.type === 'storyboardGroup',
    isImmersiveViewerActive: () => false,
    flowPosition: { x: 0, y: 0 },
    menuPosition: { x: 0, y: 0 },
    menuAllowedTypes: undefined,
    pendingConnection: null,
    pendingBatchSourceIds: null,
    connectSpawnedNode: vi.fn(),
    hideMenuForPlacement: vi.fn(),
    closeNodeMenu: vi.fn(),
  };
}

describe('useCanvasNodeInteractionController', () => {
  it('shares one client-to-flow adapter when opening the node menu', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasNodeInteractionController(options),
    );

    act(() => result.current.openNodeMenuAtClientPosition({ x: 110, y: 120 }));

    expect(options.openPlainNodeMenu).toHaveBeenCalledWith({
      flowPosition: { x: 55, y: 60 },
      menuPosition: { x: 100, y: 100 },
    });
    expect(options.selectNode).toHaveBeenCalledWith(null);
  });

  it('routes quick add through the same node factory and viewport center', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasNodeInteractionController(options),
    );

    act(() => result.current.quickAddNode('upload'));

    expect(options.createNode).toHaveBeenCalledWith(
      'upload',
      { x: 105, y: 85 },
    );
    expect(options.selectNode).toHaveBeenCalledWith('node-1');
  });
});
