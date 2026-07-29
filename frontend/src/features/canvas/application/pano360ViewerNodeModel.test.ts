// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type Pano360ViewerNodeData,
} from '@/features/canvas/domain/canvasNodes';
import {
  clampPanoFov,
  normalizePanoDegrees,
  panoFovToZoom,
  panoZoomToFov,
} from '@/features/viewer-kit/public';

import {
  PANO_GRID_2X2_FRAMES,
  PANO_GRID_4X3_FRAMES,
  buildPanoCorrectionEntry,
  clampPanoPitch,
  resolvePanoCorrectionAxis,
  resolvePanoUpstreamSource,
  resolvePanoViewerNodeSize,
} from './pano360ViewerNodeModel';

function node({
  id,
  type,
  y,
  data,
}: {
  id: string;
  type: CanvasNode['type'];
  y: number;
  data: Record<string, unknown>;
}): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y },
    data,
  } as CanvasNode;
}

function panoData(
  patch: Partial<Pano360ViewerNodeData> = {},
): Pano360ViewerNodeData {
  return {
    imageUrl: '/pano.png',
    sphereCorrectionDeg: { roll: 10, pitch: -20, yaw: 30 },
    frontYawDeg: 150,
    fovDeg: 70,
    ...patch,
  };
}

describe('pano360ViewerNodeModel', () => {
  it('projects stable node dimensions and FOV conversions', () => {
    expect(resolvePanoViewerNodeSize()).toEqual({ width: 900, height: 540 });
    expect(resolvePanoViewerNodeSize(1200.6, 700.4)).toEqual({
      width: 1201,
      height: 700,
    });
    expect(resolvePanoViewerNodeSize(500, Number.NaN)).toEqual({
      width: 900,
      height: 540,
    });
    expect(panoZoomToFov(panoFovToZoom(70))).toBeCloseTo(70);
    expect(clampPanoFov(1)).toBe(5);
    expect(clampPanoFov(200)).toBe(170);
  });

  it('selects the first supported upstream panorama by vertical order', () => {
    const source = resolvePanoUpstreamSource([
      node({
        id: 'upload-late',
        type: CANVAS_NODE_TYPES.upload,
        y: 200,
        data: { imageUrl: '/late.png' },
      }),
      node({
        id: 'unsupported',
        type: CANVAS_NODE_TYPES.script,
        y: 10,
        data: {},
      }),
      node({
        id: 'generated-first',
        type: CANVAS_NODE_TYPES.imageGen,
        y: 50,
        data: { imageUrl: null, referenceImageUrl: '/reference.png' },
      }),
    ]);

    expect(source).toEqual({
      nodeId: 'generated-first',
      url: '/reference.png',
    });
    expect(resolvePanoUpstreamSource([])).toBeNull();
  });

  it('keeps capture presets and angle normalization deterministic', () => {
    expect(PANO_GRID_2X2_FRAMES.map((frame) => frame.label)).toEqual([
      '前方',
      '右侧',
      '后方',
      '左侧',
    ]);
    expect(PANO_GRID_4X3_FRAMES).toHaveLength(12);
    expect(PANO_GRID_4X3_FRAMES[0]).toEqual({
      yawOffset: 0,
      pitch: 40,
      label: '前方·上',
    });
    expect(normalizePanoDegrees(190)).toBe(-170);
    expect(clampPanoPitch(-120)).toBe(-90);
    expect(resolvePanoCorrectionAxis('pitch', 120)).toBe(90);
    expect(resolvePanoCorrectionAxis('yaw', 270)).toBe(-90);
  });

  it('builds the persisted correction export without mutating node data', () => {
    const data = panoData();
    const entry = buildPanoCorrectionEntry(
      data,
      new Date('2026-07-30T12:00:00.000Z'),
    );

    expect(entry).toMatchObject({
      pano_url: '/pano.png',
      front_yaw_deg: 150,
      sphere_correction_deg: { roll: 10, pitch: -20, yaw: 30 },
      sphere_correction_rad: {
        roll: 0.174533,
        tilt: -0.349066,
        pan: 0.523599,
      },
      cubemap_contract: {
        front_yaw_deg: 150,
        right_yaw_deg: -120,
        back_yaw_deg: -30,
        left_yaw_deg: 60,
        seam_yaw_deg: -30,
      },
      fov_deg: 70,
      ts: '2026-07-30T12:00:00.000Z',
    });
    expect(data.sphereCorrectionDeg).toEqual({ roll: 10, pitch: -20, yaw: 30 });
  });
});
