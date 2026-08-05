// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { CANVAS_NODE_TYPES, type CanvasNode } from '../domain/canvasNodes';
import type { CanvasNodeDefaultDataGateway } from './ports';
import { normalizeCanvasNodes } from './canvasNodeHydration';
import {
  BEAT_CONTEXT_NODE_DEFAULT_MEASURED,
  SKILL_NODE_DEFAULT_MEASURED,
} from '@/modules/creative_canvas/public';

function node(
  id: string,
  type: CanvasNode['type'],
  data: Record<string, unknown> = {},
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data, ...overrides } as CanvasNode;
}

describe('Canvas node hydration', () => {
  it('merges defaults, restores measured sizes, and drops placeholders', () => {
    const normalized = normalizeCanvasNodes([
      node('skill', CANVAS_NODE_TYPES.skill, { skill_id: 'freezone.test' }),
      node('beat', CANVAS_NODE_TYPES.beatContext),
      node('placeholder', CANVAS_NODE_TYPES.upload, { label: '__NO_PROP__' }),
      node('unknown', 'unknown' as CanvasNode['type']),
    ]);

    expect(normalized.map((item) => item.id)).toEqual(['skill', 'beat']);
    expect(normalized[0]?.measured).toEqual(SKILL_NODE_DEFAULT_MEASURED);
    expect(normalized[1]?.measured).toEqual(BEAT_CONTEXT_NODE_DEFAULT_MEASURED);
    expect(normalized[0]?.data).toMatchObject({ skill_id: 'freezone.test' });
  });

  it('stops unrecoverable generation but preserves a persisted task', () => {
    const normalized = normalizeCanvasNodes([
      node('stopped', CANVAS_NODE_TYPES.imageGen, {
        isGenerating: true,
        generationStartedAt: 123,
      }),
      node('recoverable', CANVAS_NODE_TYPES.imageGen, {
        isGenerating: true,
        generationStartedAt: 456,
        generationTaskKey: 'task-key',
      }),
    ]);

    expect(normalized[0]?.data).toMatchObject({
      isGenerating: false,
      generationStartedAt: null,
    });
    expect(normalized[1]?.data).toMatchObject({
      isGenerating: true,
      generationStartedAt: 456,
      generationTaskKey: 'task-key',
    });
  });

  it('applies runtime defaults before persisted node data', () => {
    const gateway: CanvasNodeDefaultDataGateway = {
      getOverrides: () => ({ model: 'remembered-model' }),
    };
    const normalized = normalizeCanvasNodes([
      node('preferred', CANVAS_NODE_TYPES.video),
      node('persisted', CANVAS_NODE_TYPES.video, {
        model: 'persisted-model',
      }),
    ], gateway);

    expect(normalized[0]?.data).toMatchObject({ model: 'remembered-model' });
    expect(normalized[1]?.data).toMatchObject({ model: 'persisted-model' });
  });

  it('keeps the projected duplicate and orders a parent before its child', () => {
    const normalized = normalizeCanvasNodes([
      node('child', CANVAS_NODE_TYPES.beatContext, { content: 'child' }, {
        parentId: 'group',
        extent: 'parent',
      }),
      node('group', CANVAS_NODE_TYPES.group, { label: 'group' }),
      node('child', CANVAS_NODE_TYPES.beatContext, {
        projection_key: 'beat:1:1',
        content: 'projected',
      }, {
        parentId: 'group',
        extent: 'parent',
      }),
    ]);

    expect(normalized.map((item) => item.id)).toEqual(['group', 'child']);
    expect(normalized[1]?.data).toMatchObject({ content: 'projected' });
  });

  it('detaches an orphan and normalizes legacy storyboard export data', () => {
    const normalized = normalizeCanvasNodes([
      node('orphan', CANVAS_NODE_TYPES.storyboardSplit, {
        frames: [{ id: 'frame', imageUrl: null, note: '', order: 0 }],
        exportOptions: { fontSize: 48 },
      }, {
        parentId: 'missing',
        extent: 'parent',
      }),
    ]);
    const orphan = normalized[0];

    expect(orphan?.parentId).toBeUndefined();
    expect(orphan?.extent).toBeUndefined();
    expect(orphan?.data).toMatchObject({
      frameAspectRatio: '1:1',
      frames: [expect.objectContaining({ aspectRatio: '1:1' })],
      exportOptions: expect.objectContaining({ fontSize: 8 }),
    });
  });
});
