// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { resolveCanvasUpstreamDetachmentEdgeIds } from './canvasUpstreamDetachment';

describe('resolveCanvasUpstreamDetachmentEdgeIds', () => {
  it('selects every edge from the requested source into the target node', () => {
    expect(
      resolveCanvasUpstreamDetachmentEdgeIds(
        [
          { id: 'match-a', source: 'source-a', target: 'target-a' },
          { id: 'other-source', source: 'source-b', target: 'target-a' },
          { id: 'other-target', source: 'source-a', target: 'target-b' },
          { id: 'match-b', source: 'source-a', target: 'target-a' },
        ],
        'source-a',
        'target-a',
      ),
    ).toEqual(['match-a', 'match-b']);
  });

  it('returns an empty plan when the reference does not exist', () => {
    expect(
      resolveCanvasUpstreamDetachmentEdgeIds([], 'source-a', 'target-a'),
    ).toEqual([]);
  });
});
