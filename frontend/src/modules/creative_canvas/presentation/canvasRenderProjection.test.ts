// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  projectCanvasEdgesForRender,
  projectCanvasNodesForRender,
} from './canvasRenderProjection';

interface TestNode {
  id: string;
  className?: string;
  data: { label: string };
}

interface TestEdge {
  id: string;
  source: string;
  target: string;
  hidden?: boolean;
}

function node(id: string, className?: string): TestNode {
  return {
    id,
    className,
    data: { label: id },
  };
}

function edge(id: string, hidden?: boolean): TestEdge {
  return {
    id,
    source: `${id}-source`,
    target: `${id}-target`,
    hidden,
  };
}

describe('canvasRenderProjection', () => {
  it('returns the stored node array when no placement confirmation is active', () => {
    const nodes = [node('node-1')];

    expect(projectCanvasNodesForRender(nodes, null)).toBe(nodes);
  });

  it('adds the placement class only to a cloned target node', () => {
    const first = node('node-1');
    const target = node('node-2', 'existing-class');
    const nodes = [first, target];

    const projected = projectCanvasNodesForRender(nodes, 'node-2');

    expect(projected).not.toBe(nodes);
    expect(projected[0]).toBe(first);
    expect(projected[1]).not.toBe(target);
    expect(projected[1]?.className).toBe(
      'existing-class canvas-node-placement-confirm',
    );
    expect(target.className).toBe('existing-class');
  });

  it('returns the stored edge array while edge visibility is enabled', () => {
    const edges = [edge('edge-1')];

    expect(projectCanvasEdgesForRender(edges, false)).toBe(edges);
  });

  it('hides cloned visible edges without mutating already hidden edges', () => {
    const visible = edge('edge-1');
    const hidden = edge('edge-2', true);
    const edges = [visible, hidden];

    const projected = projectCanvasEdgesForRender(edges, true);

    expect(projected).not.toBe(edges);
    expect(projected[0]).toEqual({ ...visible, hidden: true });
    expect(projected[0]).not.toBe(visible);
    expect(projected[1]).toBe(hidden);
    expect(visible.hidden).toBeUndefined();
  });
});
