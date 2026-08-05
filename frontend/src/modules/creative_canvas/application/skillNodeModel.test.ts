// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import type {
  DirectorStageManifest,
} from '@/features/viewer-kit/public';
import {
  directorManifestWithScenePanoSource,
  projectSkillInputHandleIds,
  projectSkillOutputPositions,
  projectSkillReferenceInputHandles,
  resolveSkillBeatTarget,
  sceneAssetsFromSkillData,
  skillBeatContextReferences,
  skillInputSignature,
  skillRunIdempotencyKey,
} from './skillNodeModel';

type TestEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: Record<string, unknown>;
};

type TestNode = {
  id: string;
  type?: string | null;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  width?: number | null;
  height?: number | null;
  [key: string]: unknown;
};

function edge(
  id: string,
  targetHandle: string,
  sourceHandle = 'source',
): TestEdge {
  return {
    id,
    source: `source-${id}`,
    target: 'skill',
    sourceHandle,
    targetHandle,
  };
}

describe('skillNodeModel', () => {
  it('builds stable input signatures and run-scoped idempotency keys', () => {
    const left = skillInputSignature({ b: 2, a: { y: 2, x: 1 } });
    const right = skillInputSignature({ a: { x: 1, y: 2 }, b: 2 });

    expect(left).toBe(right);
    expect(skillRunIdempotencyKey('canvas', 'node', 'skill', left, 'nonce')).toBe(
      `skill:canvas:node:skill:${left}:nonce`,
    );
  });

  it('projects Beat targets and semantic empty references from current context data', () => {
    const node = {
      id: 'beat',
      type: 'beatContextNode',
      data: {
        episode: '2',
        beat_number: 3,
        detectedIdentities: ['Alice', 'Alice', '__NO_CHARACTER__'],
        detectedProps: ['Sword', '__NO_PROP__'],
        content: 'Night street',
      },
      position: { x: 0, y: 0 },
    } as TestNode;

    expect(resolveSkillBeatTarget(node)).toEqual({ episode: 2, beat: 3 });
    expect(skillBeatContextReferences(node)).toEqual({
      identities: ['Alice'],
      props: ['Sword'],
      noCharacter: true,
      noProp: true,
      visualDescription: 'Night street',
    });
  });

  it('keeps contextual reference handles and legacy connected handles without sentinels', () => {
    const references = {
      identities: ['Alice'],
      props: ['Sword'],
      noCharacter: true,
      noProp: false,
    };
    const incomingEdges = [
      edge('identity', 'identity:Alice'),
      edge('legacy', 'identity:Legacy'),
      edge('empty', 'identity:__NO_CHARACTER__'),
    ];
    const skill = {
      id: 'freezone.frame_from_context',
      inputs: [
        { role: 'identity', cardinality: 'multi', required: false },
        { role: 'prop', cardinality: 'multi', required: false },
        { role: 'beat_context', cardinality: 'single', required: true },
      ],
      outputs: [],
    } as never;

    expect(
      projectSkillInputHandleIds({
        skill,
        skillId: 'freezone.frame_from_context',
        references,
        incomingEdges,
      }),
    ).toEqual([
      'beat_context',
      'identity:Alice',
      'prop:Sword',
      'identity:Legacy',
    ]);
    expect(
      projectSkillReferenceInputHandles({
        skillId: 'freezone.frame_from_context',
        references,
        incomingEdges,
      }),
    ).toEqual({
      identity: ['identity:Alice', 'identity:Legacy'],
      prop: ['prop:Sword'],
    });
  });

  it('normalizes embedded scene assets without accepting blank URLs', () => {
    expect(
      sceneAssetsFromSkillData({
        scene_id: 'scene-a',
        master_url: ' /master.png ',
        reverse_url: ' ',
        director_env_only_url: '/environment.png',
        pano_360_url: '/pano.png',
      }),
    ).toEqual({
      scene_id: 'scene-a',
      master_url: '/master.png',
      reverse_url: null,
      director_env_only_url: '/environment.png',
      pano_360_url: '/pano.png',
      ply_url: null,
    });
  });

  it('adds one scene pano source without duplicating an existing URL', () => {
    const manifest = {
      viewer_kind: 'three_d_director',
      mode: 'beat',
      project: 'project-a',
      scene_id: 'scene-a',
      display_name: 'Scene A',
      source: { source_kind: 'master', source_type: 'sog', url: '/world.sog' },
      sources: [
        { id: 'master', source_kind: 'master', source_type: 'sog', url: '/world.sog' },
      ],
      palette: { anonymous_colors: [], anonymous_prop_colors: [] },
      capabilities: [],
    } as unknown as DirectorStageManifest;
    const assets = {
      scene_id: 'scene-a',
      master_url: null,
      reverse_url: null,
      director_env_only_url: null,
      pano_360_url: '/pano.png',
      ply_url: null,
    };

    const once = directorManifestWithScenePanoSource(manifest, assets);
    const twice = directorManifestWithScenePanoSource(once, assets);

    expect(once.sources).toHaveLength(2);
    expect(twice.sources).toHaveLength(2);
    expect(once.sources?.[1]).toMatchObject({
      source_type: 'pano360',
      source_kind: 'pano',
      pano_url: '/pano.png',
      slot_kind: 'scene_director_pano_360',
    });
  });

  it('centers generated output positions beside the Skill node', () => {
    expect(projectSkillOutputPositions({ x: 10, y: 100 }, 3)).toEqual([
      { x: 470, y: -160 },
      { x: 470, y: 100 },
      { x: 470, y: 360 },
    ]);
  });
});
