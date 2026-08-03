// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { configureCanvasStoryboardGroup } from './canvasStoryboardGroupConfig';

interface TestNode {
  id: string;
  kind: 'group' | 'node';
  parentId?: string;
  position: { x: number; y: number };
  measured: { width: number; height: number };
  width?: number;
  height?: number;
  style?: Record<string, unknown>;
  data: Record<string, unknown>;
}

const ports = {
  defaultNodeWidth: 320,
  getNodeSize: (candidate: TestNode) => candidate.measured,
  isStoryboardGroupNode: (candidate: TestNode) =>
    candidate.kind === 'group' && candidate.data.storyboardGroup === true,
};

function node(
  id: string,
  overrides: Partial<TestNode> = {},
): TestNode {
  return {
    id,
    kind: 'node',
    position: { x: 0, y: 0 },
    measured: { width: 300, height: 200 },
    data: {},
    ...overrides,
  };
}

describe('Canvas storyboard group configuration', () => {
  it('returns null for a missing or ordinary group', () => {
    const ordinary = node('ordinary', {
      kind: 'group',
    });

    expect(
      configureCanvasStoryboardGroup([ordinary], 'missing', {}, ports),
    ).toBeNull();
    expect(
      configureCanvasStoryboardGroup([ordinary], ordinary.id, {}, ports),
    ).toBeNull();
  });

  it('updates board dimensions and persisted display settings', () => {
    const group = node('group', {
      kind: 'group',
      style: { borderColor: 'red', width: 100, height: 100 },
      data: {
        storyboardGroup: true,
        storyboardAspect: '16:9',
        storyboardCols: 2,
        storyboardShowIndex: false,
      },
    });
    const children = Array.from({ length: 4 }, (_, index) =>
      node(`child-${index}`, { parentId: group.id }),
    );

    const result = configureCanvasStoryboardGroup(
      [group, ...children],
      group.id,
      { aspectKey: '4:3', cols: 4, showIndex: true },
      ports,
    );

    expect(result?.[0]).toMatchObject({
      width: 2288,
      height: 466,
      style: {
        borderColor: 'red',
        width: 2288,
        height: 466,
      },
      data: {
        storyboardAspect: '4:3',
        storyboardCols: 4,
        storyboardShowIndex: true,
      },
    });
    expect(result?.slice(1)).toEqual(children);
  });

  it('keeps current settings when a patch omits them', () => {
    const group = node('group', {
      kind: 'group',
      data: {
        storyboardGroup: true,
        storyboardAspect: '1:1',
        storyboardCols: 1,
        storyboardShowIndex: true,
      },
    });
    const child = node('child', { parentId: group.id });

    expect(
      configureCanvasStoryboardGroup(
        [group, child],
        group.id,
        {},
        ports,
      )?.[0]?.data,
    ).toMatchObject({
      storyboardAspect: '1:1',
      storyboardCols: 1,
      storyboardShowIndex: true,
    });
  });
});
