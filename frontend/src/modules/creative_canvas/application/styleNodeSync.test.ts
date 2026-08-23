// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  advanceStyleNodeSync,
  INITIAL_STYLE_NODE_SYNC_STATE,
  isStyleSyncReady,
  resolveStyleNodePlacement,
  resolveStyleNodeSyncAction,
  STYLE_NODE_GAP,
  type StyleNodeSnapshot,
  type StyleNodeSyncAction,
  type StyleNodeSyncState,
} from './styleNodeSync';

function styleNode(
  id: string,
  templateId: string | null,
  sharedWithOtherTargets = false,
): StyleNodeSnapshot {
  return { id, templateId, sharedWithOtherTargets };
}

describe('Style node synchronization', () => {
  it('creates a projection for a selected style on first synchronization', () => {
    expect(
      resolveStyleNodeSyncAction({
        selectedTemplateId: 'golden_age',
        styleNode: null,
        lastSyncedTemplateId: undefined,
        everObservedStyleNode: false,
      }),
    ).toEqual({ kind: 'create', templateId: 'golden_age' });
  });

  it('updates and removes an existing projection as the selection changes', () => {
    expect(
      resolveStyleNodeSyncAction({
        selectedTemplateId: 'cyberpunk',
        styleNode: styleNode('style', 'golden_age'),
        lastSyncedTemplateId: 'golden_age',
        everObservedStyleNode: true,
      }),
    ).toEqual({ kind: 'update', nodeId: 'style', templateId: 'cyberpunk' });
    expect(
      resolveStyleNodeSyncAction({
        selectedTemplateId: null,
        styleNode: styleNode('style', 'golden_age'),
        lastSyncedTemplateId: 'golden_age',
        everObservedStyleNode: true,
      }),
    ).toEqual({ kind: 'remove', nodeId: 'style' });
  });

  it('clears the image selection only after an observed projection is deleted', () => {
    expect(
      resolveStyleNodeSyncAction({
        selectedTemplateId: 'golden_age',
        styleNode: null,
        lastSyncedTemplateId: 'golden_age',
        everObservedStyleNode: false,
      }),
    ).toEqual({ kind: 'none' });
    expect(
      resolveStyleNodeSyncAction({
        selectedTemplateId: 'golden_age',
        styleNode: null,
        lastSyncedTemplateId: 'golden_age',
        everObservedStyleNode: true,
      }),
    ).toEqual({ kind: 'clear-selection' });
  });

  it('does not mutate a projection shared by multiple image nodes', () => {
    expect(
      resolveStyleNodeSyncAction({
        selectedTemplateId: 'cyberpunk',
        styleNode: styleNode('style', 'golden_age', true),
        lastSyncedTemplateId: 'golden_age',
        everObservedStyleNode: true,
      }),
    ).toEqual({ kind: 'none' });
    expect(
      resolveStyleNodeSyncAction({
        selectedTemplateId: null,
        styleNode: styleNode('style', 'golden_age', true),
        lastSyncedTemplateId: 'golden_age',
        everObservedStyleNode: true,
      }),
    ).toEqual({ kind: 'none' });
  });
});

function runFrames(
  frames: ReadonlyArray<{
    selectedTemplateId: string | null;
    styleNode: StyleNodeSnapshot | null;
  }>,
): { actions: StyleNodeSyncAction[]; state: StyleNodeSyncState } {
  let state = INITIAL_STYLE_NODE_SYNC_STATE;
  const actions: StyleNodeSyncAction[] = [];
  for (const frame of frames) {
    const result = advanceStyleNodeSync(state, frame);
    state = result.state;
    actions.push(result.action);
  }
  return { actions, state };
}

describe('Style node synchronization timing', () => {
  it('does not clear a new selection while the created node is returning to the store', () => {
    const { actions } = runFrames([
      { selectedTemplateId: 'golden_age', styleNode: null },
      { selectedTemplateId: 'golden_age', styleNode: null },
      {
        selectedTemplateId: 'golden_age',
        styleNode: styleNode('style', 'golden_age'),
      },
    ]);
    expect(actions).toEqual([
      { kind: 'create', templateId: 'golden_age' },
      { kind: 'none' },
      { kind: 'none' },
    ]);
  });

  it('clears the selection once after the user deletes the projection', () => {
    const { actions } = runFrames([
      { selectedTemplateId: 'golden_age', styleNode: null },
      {
        selectedTemplateId: 'golden_age',
        styleNode: styleNode('style', 'golden_age'),
      },
      { selectedTemplateId: 'golden_age', styleNode: null },
      { selectedTemplateId: null, styleNode: null },
    ]);
    expect(actions).toEqual([
      { kind: 'create', templateId: 'golden_age' },
      { kind: 'none' },
      { kind: 'clear-selection' },
      { kind: 'none' },
    ]);
  });

  it('removes a projection only once while the deletion returns to the store', () => {
    const { actions } = runFrames([
      { selectedTemplateId: 'golden_age', styleNode: null },
      {
        selectedTemplateId: 'golden_age',
        styleNode: styleNode('style', 'golden_age'),
      },
      { selectedTemplateId: null, styleNode: styleNode('style', 'golden_age') },
      { selectedTemplateId: null, styleNode: styleNode('style', 'golden_age') },
      { selectedTemplateId: null, styleNode: null },
    ]);
    expect(actions).toEqual([
      { kind: 'create', templateId: 'golden_age' },
      { kind: 'none' },
      { kind: 'remove', nodeId: 'style' },
      { kind: 'none' },
      { kind: 'none' },
    ]);
  });
});

describe('Style node synchronization prerequisites and placement', () => {
  const templates = [{ id: 'golden_age' }, { id: 'cyberpunk' }];

  it('waits for the catalog and ignores obsolete template ids', () => {
    expect(isStyleSyncReady(null, [])).toBe(false);
    expect(isStyleSyncReady('golden_age', [])).toBe(false);
    expect(isStyleSyncReady(null, templates)).toBe(true);
    expect(isStyleSyncReady('golden_age', templates)).toBe(true);
    expect(isStyleSyncReady('obsolete', templates)).toBe(false);
  });

  it('places the projection left of and vertically centered on the image node', () => {
    expect(
      resolveStyleNodePlacement({
        imageNodePosition: { x: 1000, y: 200 },
        imageNodeHeight: 360,
        styleNodeWidth: 220,
        styleNodeHeight: 124,
      }),
    ).toEqual({
      x: 1000 - 220 - STYLE_NODE_GAP,
      y: 200 + (360 - 124) / 2,
    });
  });
});
