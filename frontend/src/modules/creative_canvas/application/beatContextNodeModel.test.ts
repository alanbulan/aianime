// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  addBeatContextSelection,
  BEAT_CONTEXT_NO_CHARACTER_MARKER,
  buildBeatUpdatePayloadFromNodeData,
  buildLocalBeatContextPatch,
  buildStandaloneBeatContextPatch,
  detectBeatContextMention,
  filterBeatContextMentionCandidates,
  mergeRestoredBeatContextCanvas,
  projectBeatContextMentionCandidates,
  projectBeatContextSelectableTokens,
  resolveBeatContextNodeSize,
  resolveBeatContextSnapshot,
  resolveBeatContextTitle,
  resolveBeatContextWorkbenchTarget,
  toggleBeatContextSelection,
  type BeatContextGraphEdge,
  type BeatContextGraphNode,
  type BeatContextNodeModelData,
} from './beatContextNodeModel';

function node(
  id: string,
  data: Record<string, unknown> = {},
): BeatContextGraphNode {
  return {
    id,
    type: 'textAnnotationNode',
    position: { x: 0, y: 0 },
    data: { content: '', ...data },
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  data: Record<string, unknown> = {},
): BeatContextGraphEdge {
  return { id, source, target, data };
}

describe('beatContextNodeModel', () => {
  it('owns selection fallback and mention detection rules', () => {
    expect(
      toggleBeatContextSelection(
        [BEAT_CONTEXT_NO_CHARACTER_MARKER],
        'Alice',
        BEAT_CONTEXT_NO_CHARACTER_MARKER,
      ),
    ).toEqual(['Alice']);
    expect(
      toggleBeatContextSelection(
        ['Alice'],
        'Alice',
        BEAT_CONTEXT_NO_CHARACTER_MARKER,
      ),
    ).toEqual([BEAT_CONTEXT_NO_CHARACTER_MARKER]);
    expect(
      addBeatContextSelection(
        [BEAT_CONTEXT_NO_CHARACTER_MARKER],
        'Alice',
        BEAT_CONTEXT_NO_CHARACTER_MARKER,
      ),
    ).toEqual(['Alice']);
    expect(detectBeatContextMention('场景 @Ali', 7)).toEqual({
      start: 3,
      end: 7,
      query: 'ali',
    });
    expect(detectBeatContextMention('prefix@Ali', 10)).toBeNull();
  });

  it('projects standalone markers and builds a synchronized standalone patch', () => {
    const data: BeatContextNodeModelData = {
      context_scope: 'standalone',
      content: '旧描述',
      beat_context: {
        source: 'standalone',
        visual_description: '人物 {{Alice}} 与道具 [[Sword]]',
        detected_identities: ['Alice', 'Removed'],
        detected_props: ['Sword', 'RemovedProp'],
        sketch_colors: { Alice: '#fff' },
      },
    };
    expect(resolveBeatContextSnapshot(data)).toMatchObject({
      visualDescription: '人物 {{Alice}} 与道具 [[Sword]]',
      detectedIdentities: ['Alice'],
      detectedProps: ['Sword'],
      sketchColors: { Alice: '#fff' },
    });
    expect(
      buildStandaloneBeatContextPatch(data, {
        visual_description: '新描述 {{Bob}}',
        detected_identities: ['Bob'],
      }),
    ).toMatchObject({
      content: '新描述 {{Bob}}',
      syncStatus: 'fresh',
      errorMessage: '',
      beat_context: {
        schema: 'beat_context.v1',
        source: 'standalone',
        title: '自定义镜头上下文',
        detected_identities: ['Bob'],
      },
      snapshot: {
        visualDescription: '新描述 {{Bob}}',
        detectedIdentities: ['Bob'],
      },
    });
  });

  it('restores preset topology while preserving only valid local user work', () => {
    const result = mergeRestoredBeatContextCanvas(
      [node('remote')],
      [edge('remote-edge', 'remote', 'remote')],
      [
        node('remote', { local: true }),
        node('user'),
        node('preset', { preset_managed: true }),
        node('bad-projection', { autoBeatContextProjection: true }),
      ],
      [
        edge('remote-edge', 'remote', 'remote'),
        edge('user-edge', 'remote', 'user'),
        edge('dangling', 'remote', 'preset'),
        edge('bad-edge', 'remote', 'user', {
          autoBeatContextProjection: true,
        }),
      ],
    );
    expect(result.nodes.map((item) => item.id)).toEqual(['remote', 'user']);
    expect(result.edges.map((item) => item.id)).toEqual([
      'remote-edge',
      'user-edge',
    ]);
  });

  it('merges local Beat edits and rebuilds the database update payload', () => {
    const data: BeatContextNodeModelData = {
      content: '旧描述',
      snapshot: {
        sceneId: '旧场景',
        detectedIdentities: ['Alice'],
      },
    };
    const patch = buildLocalBeatContextPatch(data, {
      visual_description: '新描述',
      scene_ref: { scene_id: 'scene-a', variant_id: 'night' },
      time_of_day: 'night',
      detected_props: ['Sword'],
    });
    expect(patch).toMatchObject({
      content: '新描述',
      syncStatus: 'stale',
      snapshot: {
        visualDescription: '新描述',
        sceneId: 'scene-a',
        sceneVariantId: 'night',
        timeOfDay: 'night',
        detectedProps: ['Sword'],
      },
    });
    expect(
      buildBeatUpdatePayloadFromNodeData({ ...data, ...patch }),
    ).toEqual({
      visual_description: '新描述',
      scene_ref: { scene_id: 'scene-a', variant_id: 'night' },
      time_of_day: 'night',
      detected_identities: ['Alice'],
      detected_props: ['Sword'],
    });
  });

  it('resolves stable titles, workbench targets, and persisted node size', () => {
    expect(
      resolveBeatContextTitle({ episode: 2, beat: 7 } as BeatContextNodeModelData),
    ).toBe('EP2 / Beat 7');
    expect(
      resolveBeatContextTitle({
        context_scope: 'standalone',
        displayName: 'EP2 / Beat 7',
      } as BeatContextNodeModelData),
    ).toBe('自定义镜头上下文');
    expect(
      resolveBeatContextWorkbenchTarget({
        workbench_target: { scope: 'beat', episode: 2, beat: 7 },
      } as BeatContextNodeModelData),
    ).toEqual({ scope: 'beat', episode: 2, beat: 7 });
    expect(resolveBeatContextNodeSize(undefined, 700)).toEqual({
      width: 420,
      height: 700,
    });
  });

  it('projects bounded mention candidates and stale selectable tokens', () => {
    const candidates = projectBeatContextMentionCandidates({
      standalone: false,
      identityIds: ['Alice', 'Bob'],
      propIds: ['Sword'],
    });
    expect(
      filterBeatContextMentionCandidates(candidates, {
        start: 0,
        end: 3,
        query: 'ali',
      }),
    ).toEqual([
      {
        kind: 'identity',
        id: 'Alice',
        label: 'Alice',
        token: '{{Alice}}',
      },
    ]);
    expect(
      projectBeatContextSelectableTokens(
        [BEAT_CONTEXT_NO_CHARACTER_MARKER, 'Alice'],
        ['Alice', 'Removed'],
        BEAT_CONTEXT_NO_CHARACTER_MARKER,
      ),
    ).toEqual({
      selected: ['Alice', 'Removed'],
      tokens: [
        { id: BEAT_CONTEXT_NO_CHARACTER_MARKER, stale: false },
        { id: 'Alice', stale: false },
        { id: 'Removed', stale: true },
      ],
    });
  });
});
