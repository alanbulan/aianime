// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type ThreeDWorldNodeData,
} from '@/features/canvas/domain/canvasNodes';
import type { MainlineContext } from '@/modules/creative_canvas/public';
import type { ThreeDSceneSnapshot } from '@/features/viewer-kit/public';
import {
  buildLocalThreeDWorldDirectorManifest,
  buildThreeDWorldClearScenePatch,
  buildThreeDWorldSaveScenePatch,
  pickThreeDWorldPlyUrl,
  projectThreeDWorldPreview,
  projectThreeDWorldReferences,
  resolveThreeDWorldImageSourceKind,
  resolveThreeDWorldNodeSize,
} from './threeDWorldNodeModel';

function uploadNode(
  id: string,
  y: number,
  data: Record<string, unknown>,
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y },
    data,
  } as CanvasNode;
}

function textNode(id: string, y: number, content: string): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.textAnnotation,
    position: { x: 0, y },
    data: { content },
  };
}

describe('threeDWorldNodeModel', () => {
  it('sorts usable upstream references and preserves an explicit image choice', () => {
    const projection = projectThreeDWorldReferences(
      [
        uploadNode('late', 200, {
          displayName: '后置图片',
          imageUrl: '/late.png',
        }),
        textNode('prompt', 100, '  建筑外观  '),
        uploadNode('early', 0, {
          displayName: '前置图片',
          imageUrl: '/early.png',
        }),
      ],
      'late',
    );

    expect(projection.selectedImageRef?.nodeId).toBe('late');
    expect(projection.referenceImages).toEqual([
      { nodeId: 'early', url: '/early.png', displayName: '前置图片' },
      { nodeId: 'late', url: '/late.png', displayName: '后置图片' },
    ]);
    expect(
      projectThreeDWorldReferences(
        [textNode('prompt', 100, '  建筑外观  ')],
        null,
      ).activeRef,
    ).toMatchObject({
      nodeId: 'prompt',
      kind: 'text',
      textContent: '建筑外观',
    });
  });

  it('prefers packaged 3D results and resolves persisted node dimensions', () => {
    expect(
      pickThreeDWorldPlyUrl({
        output: {
          ply_url: '/world.ply',
          nested: { asset_url: '/world.sog' },
        },
      }),
    ).toBe('/world.sog');
    expect(resolveThreeDWorldNodeSize(undefined, 420.4)).toEqual({
      width: 340,
      height: 420,
    });
  });

  it('builds a blank scene or beat Director manifest without inventing sources', () => {
    const sceneContexts: MainlineContext[] = [
      {
        kind: 'scene',
        projectId: 'project-a',
        sceneId: 'scene-a',
      },
    ];
    const sceneManifest = buildLocalThreeDWorldDirectorManifest({
      project: 'project-a',
      data: { displayName: '自定义世界' },
      contexts: sceneContexts,
      beatContext: null,
      upstreamPanoSources: [],
      defaultPalette: {
        actors: [],
        props: [],
        anonymous_colors: ['#111111'],
        anonymous_prop_colors: ['#222222'],
      },
    });
    expect(sceneManifest).toMatchObject({
      mode: 'scene',
      scene_id: 'scene-a',
      display_name: '自定义世界',
      source: { source_type: 'sog', source_kind: 'custom' },
      palette: {
        anonymous_colors: ['#111111'],
        anonymous_prop_colors: ['#222222'],
      },
      allowed_destinations: ['view', 'download', 'canvas_screenshot_node'],
    });

    const beatManifest = buildLocalThreeDWorldDirectorManifest({
      project: 'project-a',
      data: {},
      contexts: [],
      beatContext: { episode: 2, beat: 3 },
      upstreamPanoSources: [],
      defaultPalette: null,
    });
    expect(beatManifest.beat_context).toMatchObject({ episode: 2, beat: 3 });
    expect(beatManifest.allowed_destinations).toContain(
      'beat_selected_background',
    );
  });

  it('prioritizes composite previews and recognizes panorama source hints', () => {
    const data: ThreeDWorldNodeData = {
      previewImageUrl: '/combined.png',
      plyUrl: '/world.sog',
      director_control_bundle: {},
    };
    expect(
      projectThreeDWorldPreview({
        data,
        activeRef: {
          nodeId: 'image',
          kind: 'image',
          displayName: '上游',
          imageUrl: '/upstream.png',
        },
        upstreamPanoSources: [],
      }),
    ).toMatchObject({
      previewUrl: '/combined.png',
      hasPreview: true,
    });
    expect(
      resolveThreeDWorldImageSourceKind(
        uploadNode('pano', 0, {
          imageUrl: '/pano.png',
          aspectRatio: '2:1',
        }),
        undefined,
      ),
    ).toBe('pano');
    expect(resolveThreeDWorldImageSourceKind(null, 'master')).toBe('master');
  });

  it('builds immutable save and per-source clear patches', () => {
    const previousScene = {
      world: { activeSourceId: 'old' },
    } as ThreeDSceneSnapshot;
    const nextScene = {
      world: {
        activeSourceId: 'source-a',
        sourceTransform: { position: [1, 2, 3] },
      },
    } as unknown as ThreeDSceneSnapshot;
    const data: ThreeDWorldNodeData = {
      scene: previousScene,
      activeSourceId: 'source-a',
      scenesBySourceId: { old: previousScene },
      sources: [
        {
          id: 'source-a',
          source_type: 'sog',
          ply_url: '/world.sog',
        },
      ],
    };
    const savePatch = buildThreeDWorldSaveScenePatch(
      data,
      [],
      nextScene,
    );
    expect(savePatch).toMatchObject({
      scene: nextScene,
      activeSourceId: 'source-a',
      scenesBySourceId: { old: previousScene, 'source-a': nextScene },
      sources: [
        expect.objectContaining({
          id: 'source-a',
          transform: { position: [1, 2, 3] },
        }),
      ],
    });
    expect(data.scenesBySourceId).toEqual({ old: previousScene });
    expect(buildThreeDWorldClearScenePatch(data, 'old')).toEqual({
      scene: null,
      scenesBySourceId: {},
    });
  });
});
