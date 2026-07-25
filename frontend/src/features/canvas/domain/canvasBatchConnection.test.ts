// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeType,
} from './canvasNodes';
import {
  planCanvasBatchConnectTarget,
  resolveCanvasBatchConnectContext,
} from './canvasBatchConnection';

function node(
  id: string,
  type: CanvasNodeType,
  options: {
    selected?: boolean;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
  } = {},
): CanvasNode {
  return {
    id,
    type,
    selected: options.selected,
    position: options.position ?? { x: 0, y: 0 },
    measured: options.size,
    data: {},
  } as CanvasNode;
}

describe('Canvas batch connection', () => {
  it('intersects downstream types and projects the selected source bounds', () => {
    const upload = node('upload', CANVAS_NODE_TYPES.upload, {
      selected: true,
      position: { x: 10, y: 20 },
      size: { width: 100, height: 50 },
    });
    const video = node('video', CANVAS_NODE_TYPES.video, {
      selected: true,
      position: { x: 200, y: 100 },
      size: { width: 80, height: 120 },
    });
    const group = node('group', CANVAS_NODE_TYPES.group, { selected: true });

    expect(resolveCanvasBatchConnectContext([upload, video, group])).toEqual({
      sourceIds: ['upload', 'video'],
      allowedTypes: [
        CANVAS_NODE_TYPES.textAnnotation,
        CANVAS_NODE_TYPES.video,
        CANVAS_NODE_TYPES.script,
      ],
      bboxRightCenter: { x: 280, y: 120 },
    });
  });

  it('rejects fewer than two sources and incompatible downstream intersections', () => {
    const upload = node('upload', CANVAS_NODE_TYPES.upload, { selected: true });
    const audio = node('audio', CANVAS_NODE_TYPES.audio, { selected: true });
    const panorama = node('panorama', CANVAS_NODE_TYPES.pano360Viewer, {
      selected: true,
    });

    expect(resolveCanvasBatchConnectContext([upload])).toBeNull();
    expect(resolveCanvasBatchConnectContext([audio, panorama])).toBeNull();
  });

  it('keeps source order while filtering a batch for the dropped target', () => {
    const text = node('text', CANVAS_NODE_TYPES.textAnnotation);
    const upload = node('upload', CANVAS_NODE_TYPES.upload);
    const audio = node('audio', CANVAS_NODE_TYPES.audio);

    expect(planCanvasBatchConnectTarget(
      [text, upload, audio],
      [upload.id, text.id],
      audio.id,
    )).toEqual({
      targetId: audio.id,
      sourceIds: [text.id],
    });
  });

  it('distinguishes an invalid target from a valid target with no eligible source', () => {
    const video = node('video', CANVAS_NODE_TYPES.video);
    const audio = node('audio', CANVAS_NODE_TYPES.audio);
    const upload = node('upload', CANVAS_NODE_TYPES.upload);

    expect(planCanvasBatchConnectTarget([video, audio], [video.id], audio.id)).toEqual({
      targetId: audio.id,
      sourceIds: [],
    });
    expect(planCanvasBatchConnectTarget([video, upload], [video.id], upload.id)).toBeNull();
    expect(planCanvasBatchConnectTarget([video], [video.id], video.id)).toBeNull();
    expect(planCanvasBatchConnectTarget([video], [video.id], 'missing')).toBeNull();
  });
});
