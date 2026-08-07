// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSmoothMinimapPan } from './useSmoothMinimapPan';

const MINIMAP_RECT = {
  left: 100,
  top: 100,
  right: 300,
  bottom: 250,
  width: 200,
  height: 150,
};
const FRAME_MS = 1000 / 60;

interface TestNode {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  parentId?: string;
  hidden?: boolean;
}

const PLAIN_NODES: TestNode[] = [
  { id: 'node', position: { x: 0, y: 0 }, width: 2000, height: 1500 },
];

let animationFrames = new Map<number, FrameRequestCallback>();
let nextAnimationFrameId = 1;
let now = 0;

function flushFrames(maxFrames: number) {
  for (let index = 0; index < maxFrames; index += 1) {
    if (animationFrames.size === 0) return;
    now += FRAME_MS;
    const pending = [...animationFrames.values()];
    animationFrames.clear();
    pending.forEach((callback) => callback(now));
  }
}

function pointerEvent(
  type: string,
  init: {
    pointerId: number;
    clientX: number;
    clientY: number;
    button?: number;
  },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
    button: init.button ?? 0,
  });
  Object.defineProperty(event, 'pointerId', { value: init.pointerId });
  return event;
}

function mountMinimap() {
  const wrapper = document.createElement('div');
  const minimap = document.createElement('div');
  minimap.className = 'react-flow__minimap';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  minimap.appendChild(svg);
  wrapper.appendChild(minimap);
  document.body.appendChild(wrapper);
  const rect = {
    ...MINIMAP_RECT,
    x: MINIMAP_RECT.left,
    y: MINIMAP_RECT.top,
    toJSON: () => ({}),
  } as DOMRect;
  minimap.getBoundingClientRect = () => rect;
  svg.getBoundingClientRect = () => rect;
  return { wrapper, svg };
}

function nodeBounds(allNodes: TestNode[]) {
  const byId = new Map(allNodes.map((node) => [node.id, node]));
  const absolutePosition = (node: TestNode): { x: number; y: number } => {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (!parent) return node.position;
    const parentPosition = absolutePosition(parent);
    return {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y,
    };
  };
  return vi.fn((nodes: TestNode[]) => {
    if (nodes.length === 0) return { width: 0, height: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    nodes.forEach((node) => {
      const position = absolutePosition(node);
      minX = Math.min(minX, position.x);
      minY = Math.min(minY, position.y);
      maxX = Math.max(maxX, position.x + node.width);
      maxY = Math.max(maxY, position.y + node.height);
    });
    return { width: maxX - minX, height: maxY - minY };
  });
}

function createRuntime(
  nodes: TestNode[] = PLAIN_NODES,
  initial = { x: 0, y: 0, zoom: 0.5 },
) {
  let viewport = { ...initial };
  const setViewport = vi.fn((
    next: typeof viewport,
    _options: { duration: number },
  ) => {
    viewport = { ...next };
  });
  return {
    getViewport: () => viewport,
    setViewport,
    getNodes: () => nodes,
    getNodesBounds: nodeBounds(nodes),
    currentViewport: () => viewport,
  };
}

describe('useSmoothMinimapPan', () => {
  beforeEach(() => {
    animationFrames = new Map();
    nextAnimationFrameId = 1;
    now = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextAnimationFrameId;
      nextAnimationFrameId += 1;
      animationFrames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      animationFrames.delete(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function setup(nodes: TestNode[] = PLAIN_NODES) {
    const { wrapper, svg } = mountMinimap();
    const runtimePort = createRuntime(nodes);
    const onPanStart = vi.fn();
    const onPanEnd = vi.fn();
    const onViewportSettled = vi.fn();
    const view = renderHook(() => useSmoothMinimapPan({
      enabled: true,
      wrapperRef: { current: wrapper },
      runtimePort,
      onPanStart,
      onPanEnd,
      onViewportSettled,
    }));
    return {
      view,
      svg,
      runtimePort,
      onPanStart,
      onPanEnd,
      onViewportSettled,
    };
  }

  it('keeps panning outside the minimap with a stable scale', () => {
    const { svg, runtimePort, onPanStart, onPanEnd } = setup();
    svg.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: 7,
      clientX: 200,
      clientY: 180,
    }));
    expect(onPanStart).toHaveBeenCalledOnce();

    window.dispatchEvent(pointerEvent('pointermove', {
      pointerId: 7,
      clientX: 220,
      clientY: 180,
    }));
    flushFrames(120);
    expect(runtimePort.currentViewport().x).toBeCloseTo(-100, 5);

    window.dispatchEvent(pointerEvent('pointermove', {
      pointerId: 7,
      clientX: 240,
      clientY: 180,
    }));
    flushFrames(120);
    expect(runtimePort.currentViewport().x).toBeCloseTo(-200, 5);
    expect(onPanEnd).not.toHaveBeenCalled();

    window.dispatchEvent(pointerEvent('pointerup', {
      pointerId: 7,
      clientX: 240,
      clientY: 400,
    }));
    flushFrames(120);
    expect(onPanEnd).toHaveBeenCalledWith(false);
  });

  it('filters hidden grouped nodes when calculating the drag scale', () => {
    const nodes: TestNode[] = [
      { id: 'group', position: { x: 10000, y: 0 }, width: 2000, height: 1500 },
      {
        id: 'child',
        parentId: 'group',
        hidden: true,
        position: { x: 20, y: 10 },
        width: 100,
        height: 100,
      },
    ];
    const { svg, runtimePort } = setup(nodes);
    svg.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: 9,
      clientX: 200,
      clientY: 180,
    }));
    expect(runtimePort.getNodesBounds.mock.calls[0][0].map((node) => node.id))
      .toEqual(['group']);

    window.dispatchEvent(pointerEvent('pointermove', {
      pointerId: 9,
      clientX: 220,
      clientY: 180,
    }));
    flushFrames(120);
    expect(runtimePort.currentViewport().x).toBeCloseTo(-100, 5);
  });

  it('commits only after easing settles and then stops animation', () => {
    const { svg, runtimePort, onViewportSettled } = setup();
    svg.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: 2,
      clientX: 200,
      clientY: 180,
    }));
    window.dispatchEvent(pointerEvent('pointermove', {
      pointerId: 2,
      clientX: 220,
      clientY: 180,
    }));
    flushFrames(3);
    expect(runtimePort.setViewport.mock.calls.length).toBeGreaterThan(1);
    expect(onViewportSettled).not.toHaveBeenCalled();

    flushFrames(120);
    expect(onViewportSettled).toHaveBeenCalledOnce();
    expect(onViewportSettled.mock.calls[0][0].x).toBeCloseTo(-100, 5);
    expect(animationFrames.size).toBe(0);
  });

  it('delays pan end until the viewport reaches its target', () => {
    const { svg, runtimePort, onPanEnd } = setup();
    svg.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: 4,
      clientX: 200,
      clientY: 180,
    }));
    window.dispatchEvent(pointerEvent('pointermove', {
      pointerId: 4,
      clientX: 600,
      clientY: 180,
    }));
    flushFrames(2);
    window.dispatchEvent(pointerEvent('pointerup', {
      pointerId: 4,
      clientX: 600,
      clientY: 180,
    }));
    expect(onPanEnd).not.toHaveBeenCalled();
    flushFrames(5);
    expect(onPanEnd).not.toHaveBeenCalled();
    expect(Math.abs(runtimePort.currentViewport().x)).toBeLessThan(2000);

    flushFrames(120);
    expect(runtimePort.currentViewport().x).toBeCloseTo(-2000, 5);
    expect(onPanEnd).toHaveBeenCalledOnce();
  });

  it('returns the panning state when unmounted during a drag', () => {
    const { view, svg, onPanEnd } = setup();
    svg.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: 5,
      clientX: 200,
      clientY: 180,
    }));
    view.unmount();
    expect(onPanEnd).toHaveBeenCalledWith(false);
  });
});
