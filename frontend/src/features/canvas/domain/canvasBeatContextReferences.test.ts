// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from './canvasNodes';
import { collectCanvasBeatContextEpisodeReferences } from './canvasBeatContextReferences';

function beatContextNode(
  id: string,
  data: { projectId?: string; episode?: number },
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.beatContext,
    position: { x: 0, y: 0 },
    data,
  } as CanvasNode;
}

describe('collectCanvasBeatContextEpisodeReferences', () => {
  it('uses node project overrides, defaults, deduplication, and stable ordering', () => {
    expect(collectCanvasBeatContextEpisodeReferences([
      beatContextNode('node-1', { projectId: 'project-b', episode: 2 }),
      beatContextNode('node-2', { episode: 3 }),
      beatContextNode('node-3', { projectId: 'project-b', episode: 2 }),
      beatContextNode('node-4', { projectId: 'project-a', episode: 1 }),
    ], 'project-default')).toEqual([
      { projectId: 'project-a', episode: 1 },
      { projectId: 'project-b', episode: 2 },
      { projectId: 'project-default', episode: 3 },
    ]);
  });

  it('ignores unrelated nodes and incomplete references', () => {
    const unrelatedNode = {
      id: 'upload-1',
      type: CANVAS_NODE_TYPES.upload,
      position: { x: 0, y: 0 },
      data: {},
    } as CanvasNode;

    expect(collectCanvasBeatContextEpisodeReferences([
      unrelatedNode,
      beatContextNode('missing-project', { episode: 1 }),
      beatContextNode('missing-episode', { projectId: 'project-1' }),
      beatContextNode('invalid-episode', { projectId: 'project-1', episode: 0 }),
    ], null)).toEqual([]);
  });
});
