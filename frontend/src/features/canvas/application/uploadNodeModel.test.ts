// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import type { UploadImageNodeData } from '@/features/canvas/domain/canvasNodes';
import type { DirectorControlFrameBundle } from '@/features/viewer-kit/public';

import {
  directorControlBundleFromData,
  resolveDroppedMediaFile,
  resolveUploadMediaKind,
  resolveUploadNodeDirectorSource,
  resolveUploadNodeLayout,
  resolveUploadNodeTitle,
  sceneSnapshotFromDirectorControlBundle,
} from './uploadNodeModel';

function data(
  patch: Partial<UploadImageNodeData> = {},
): UploadImageNodeData {
  return {
    label: '上传资源',
    displayName: '上传资源',
    imageUrl: null,
    aspectRatio: '1:1',
    ...patch,
  };
}

function directorBundle(): DirectorControlFrameBundle {
  return {
    schema_version: 'director_control_bundle_v1',
    dir: 'freezone/director-world',
    paths: {},
    rel_paths: {},
    source: {
      source_id: 'fallback-source',
      source_type: 'sog',
      source_kind: 'master',
    },
    frame_meta: {
      schema_version: 'director_frame_meta_v1',
      source: {
        source_id: 'frame-source',
        source_type: 'sog',
        source_kind: 'master',
      },
      camera: {
        mode: 'sog',
        frame_aspect: '16:9',
        state: { fov: 55 },
      },
      layer: {
        source_id: 'frame-source',
        actors: [
          {
            id: 'actor-a',
            kind: 'actor',
            label: '角色 A',
            color: '#123456',
            scale: [1, 2, 3],
            placement: {
              space: 'world',
              position: [4, 5, 6],
              yaw_deg: 30,
            },
            pose: 'standing',
            action_playing: true,
          },
        ],
        props: [],
        stagings: [],
      },
    },
  };
}

describe('uploadNodeModel', () => {
  it('projects fallback dimensions and aspect-aware resize constraints', () => {
    expect(resolveUploadNodeLayout('16:9', 1, Number.NaN)).toEqual({
      width: 533,
      height: 300,
      resizeMinWidth: 249,
      resizeMinHeight: 140,
    });
    expect(resolveUploadNodeLayout('1:1', 401.6, 302.2)).toMatchObject({
      width: 402,
      height: 302,
    });
  });

  it('keeps filename, image-only, and explicit title precedence', () => {
    expect(
      resolveUploadNodeTitle(data({ sourceFileName: ' shot.png ' }), true),
    ).toBe('shot.png');
    expect(resolveUploadNodeTitle(data({ imageOnly: true }), false)).toBe(
      '上传图片',
    );
    expect(
      resolveUploadNodeTitle(
        data({ displayName: '自定义标题', sourceFileName: 'shot.png' }),
        true,
      ),
    ).toBe('自定义标题');
  });

  it('recognizes empty-MIME videos and filters dropped file items', () => {
    const video = new File(['video'], 'source.mxf', { type: '' });
    const audio = new File(['audio'], 'voice.wav', { type: 'audio/wav' });
    const image = new File(['image'], 'frame.png', { type: 'image/png' });

    expect(resolveUploadMediaKind(video)).toBe('video');
    expect(resolveUploadMediaKind(audio)).toBe('audio');
    expect(resolveUploadMediaKind(image)).toBe('image');
    expect(
      resolveDroppedMediaFile({
        files: [],
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'file', type: '', getAsFile: () => video },
        ],
      }),
    ).toBe(video);
  });

  it('projects Director source context and restores its scene snapshot', () => {
    expect(
      resolveUploadNodeDirectorSource(
        data({
          __freezone_source: {
            role: 'director_combined',
            episode: 1,
            beat: 2,
            meta: { episode: 3, beat: 4 },
          },
        }),
      ),
    ).toEqual({
      role: 'director_combined',
      episode: 3,
      beat: 4,
      canOpenDirectorStage: true,
    });

    const bundle = directorBundle();
    expect(directorControlBundleFromData(bundle)).toBe(bundle);
    expect(directorControlBundleFromData({ schema_version: 'other' })).toBeNull();
    expect(sceneSnapshotFromDirectorControlBundle(bundle, 1234)).toEqual({
      schemaVersion: 1,
      savedAt: 1234,
      actors: [
        {
          label: '角色 A',
          color: '#123456',
          placement: {
            space: 'world',
            position: [4, 5, 6],
            yawDeg: 30,
          },
          position: [4, 5, 6],
          yawDeg: 30,
          scale: [1, 2, 3],
          pose: 'standing',
          actionPlaying: true,
        },
      ],
      props: [],
      stagings: [],
      world: { activeSourceId: 'frame-source' },
      camera: { fov: 55 },
    });
  });
});
