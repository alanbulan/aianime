// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  normalizeCanvasNodes,
  type HydrationGraphNode,
} from './canvasNodeHydration';
import {
  BEAT_CONTEXT_NODE_DEFAULT_MEASURED,
  SKILL_NODE_DEFAULT_MEASURED,
} from './canvasNodeCreation';
import type {
  CanvasNodeDefaultDataCatalog,
  CanvasNodeDefaultDataGateway,
} from './canvasNodeDefaultData';

function node(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
  overrides: Partial<HydrationGraphNode> = {},
): HydrationGraphNode {
  return { id, type, data, ...overrides };
}

const catalog: CanvasNodeDefaultDataCatalog = {
  getDefinition: () => ({ createDefaultData: () => ({}) }),
};

describe('Canvas node hydration', () => {
  it('merges defaults, restores measured sizes, and drops placeholders', () => {
    const normalized = normalizeCanvasNodes([
      node('skill', 'skillNode', { skill_id: 'freezone.test' }),
      node('beat', 'beatContextNode'),
      node('placeholder', 'uploadNode', { label: '__NO_PROP__' }),
      node('unknown', 'unknown'),
    ], undefined, catalog);

    expect(normalized.map((item) => item.id)).toEqual(['skill', 'beat']);
    expect(normalized[0]?.measured).toEqual(SKILL_NODE_DEFAULT_MEASURED);
    expect(normalized[1]?.measured).toEqual(BEAT_CONTEXT_NODE_DEFAULT_MEASURED);
    expect(normalized[0]?.data).toMatchObject({ skill_id: 'freezone.test' });
  });

  it('stops unrecoverable generation but preserves a persisted task', () => {
    const normalized = normalizeCanvasNodes([
      node('stopped', 'imageGenNode', {
        isGenerating: true,
        generationStartedAt: 123,
      }),
      node('recoverable', 'imageGenNode', {
        isGenerating: true,
        generationStartedAt: 456,
        generationTaskKey: 'task-key',
      }),
    ], undefined, catalog);

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
      node('preferred', 'videoNode'),
      node('persisted', 'videoNode', {
        model: 'persisted-model',
      }),
    ], gateway, catalog);

    expect(normalized[0]?.data).toMatchObject({ model: 'remembered-model' });
    expect(normalized[1]?.data).toMatchObject({ model: 'persisted-model' });
  });

  it('keeps the projected duplicate and orders a parent before its child', () => {
    const normalized = normalizeCanvasNodes([
      node('child', 'beatContextNode', { content: 'child' }, {
        parentId: 'group',
        extent: 'parent',
      }),
      node('group', 'groupNode', { label: 'group' }),
      node('child', 'beatContextNode', {
        projection_key: 'beat:1:1',
        content: 'projected',
      }, {
        parentId: 'group',
        extent: 'parent',
      }),
    ], undefined, catalog);

    expect(normalized.map((item) => item.id)).toEqual(['group', 'child']);
    expect(normalized[1]?.data).toMatchObject({ content: 'projected' });
  });

  it('detaches an orphan and normalizes legacy storyboard export data', () => {
    const normalized = normalizeCanvasNodes([
      node('orphan', 'storyboardNode', {
        frames: [{ id: 'frame', imageUrl: null, note: '', order: 0 }],
        exportOptions: { fontSize: 48 },
      }, {
        parentId: 'missing',
        extent: 'parent',
      }),
    ], undefined, catalog);
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
