// Copyright (c) 2026 AI anime
import {
  isExportImageNode,
  isImageEditNode,
  isImageGenNode,
  isStoryboardGenNode,
  isUploadNode,
  type CanvasNode,
  type Pano360ViewerNodeData,
} from '@/features/canvas/domain/canvasNodes';
import {
  PANO_DEGREES_TO_RADIANS,
  normalizePanoDegrees,
} from '@/features/viewer-kit/public';

export const PANO_VIEWER_SIZE_LIMITS = {
  minWidth: 900,
  minHeight: 540,
  maxWidth: 1600,
  maxHeight: 1200,
} as const;

export const PANO_DIRECTION_OFFSETS = {
  front: 0,
  right: 90,
  back: 180,
  left: -90,
  seam: -180,
} as const;

export type PanoDirection = keyof typeof PANO_DIRECTION_OFFSETS;

export interface PanoCaptureFrameSpec {
  yawOffset: number;
  pitch: number;
  label: string;
}

export interface PanoUpstreamSource {
  nodeId: string;
  url: string;
}

export const PANO_GRID_2X2_FRAMES: readonly PanoCaptureFrameSpec[] = [
  { yawOffset: PANO_DIRECTION_OFFSETS.front, pitch: 0, label: '前方' },
  { yawOffset: PANO_DIRECTION_OFFSETS.right, pitch: 0, label: '右侧' },
  { yawOffset: PANO_DIRECTION_OFFSETS.back, pitch: 0, label: '后方' },
  { yawOffset: PANO_DIRECTION_OFFSETS.left, pitch: 0, label: '左侧' },
];

const GRID_4X3_DIRECTIONS = [
  { offset: PANO_DIRECTION_OFFSETS.front, name: '前方' },
  { offset: PANO_DIRECTION_OFFSETS.right, name: '右侧' },
  { offset: PANO_DIRECTION_OFFSETS.back, name: '后方' },
  { offset: PANO_DIRECTION_OFFSETS.left, name: '左侧' },
] as const;

const GRID_4X3_PITCHES = [
  { value: 40, name: '上' },
  { value: 0, name: '平' },
  { value: -40, name: '下' },
] as const;

export const PANO_GRID_4X3_FRAMES: readonly PanoCaptureFrameSpec[] =
  GRID_4X3_PITCHES.flatMap((pitch) =>
    GRID_4X3_DIRECTIONS.map((direction) => ({
      yawOffset: direction.offset,
      pitch: pitch.value,
      label: `${direction.name}·${pitch.name}`,
    })),
  );

function upstreamPanoUrl(node: CanvasNode): string | null {
  if (isImageGenNode(node)) {
    const referenceUrl =
      typeof node.data.referenceImageUrl === 'string' &&
      node.data.referenceImageUrl.length > 0
        ? node.data.referenceImageUrl
        : null;
    return node.data.imageUrl || referenceUrl;
  }
  if (
    isUploadNode(node) ||
    isImageEditNode(node) ||
    isExportImageNode(node) ||
    isStoryboardGenNode(node)
  ) {
    return node.data.imageUrl || null;
  }
  return null;
}

export function resolvePanoUpstreamSource(
  upstreamNodes: readonly CanvasNode[],
): PanoUpstreamSource | null {
  const orderedNodes = [...upstreamNodes].sort(
    (left, right) => (left.position?.y ?? 0) - (right.position?.y ?? 0),
  );
  for (const node of orderedNodes) {
    const url = upstreamPanoUrl(node);
    if (url) return { nodeId: node.id, url };
  }
  return null;
}

function resolveNodeDimension(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 1) {
    return Math.round(value);
  }
  return fallback;
}

export function resolvePanoViewerNodeSize(
  width?: number,
  height?: number,
): { width: number; height: number } {
  return {
    width: Math.max(
      PANO_VIEWER_SIZE_LIMITS.minWidth,
      resolveNodeDimension(width, PANO_VIEWER_SIZE_LIMITS.minWidth),
    ),
    height: Math.max(
      PANO_VIEWER_SIZE_LIMITS.minHeight,
      resolveNodeDimension(height, PANO_VIEWER_SIZE_LIMITS.minHeight),
    ),
  };
}

export function clampPanoPitch(value: number): number {
  return Math.max(-90, Math.min(90, value));
}

export function resolvePanoCorrectionAxis(
  axis: 'roll' | 'pitch' | 'yaw',
  value: number,
): number {
  return axis === 'pitch'
    ? clampPanoPitch(value)
    : normalizePanoDegrees(value);
}

export function buildPanoCorrectionEntry(
  data: Pano360ViewerNodeData,
  timestamp = new Date(),
): Record<string, unknown> {
  const { roll, pitch, yaw } = data.sphereCorrectionDeg;
  const front = data.frontYawDeg;
  return {
    pano_url: data.imageUrl,
    front_yaw_deg: front,
    sphere_correction_deg: { roll, pitch, yaw },
    sphere_correction_rad: {
      roll: +(roll * PANO_DEGREES_TO_RADIANS).toFixed(6),
      tilt: +(pitch * PANO_DEGREES_TO_RADIANS).toFixed(6),
      pan: +(yaw * PANO_DEGREES_TO_RADIANS).toFixed(6),
    },
    cubemap_contract: {
      front_yaw_deg: front,
      right_yaw_deg: normalizePanoDegrees(
        front + PANO_DIRECTION_OFFSETS.right,
      ),
      back_yaw_deg: normalizePanoDegrees(
        front + PANO_DIRECTION_OFFSETS.back,
      ),
      left_yaw_deg: normalizePanoDegrees(
        front + PANO_DIRECTION_OFFSETS.left,
      ),
      seam_yaw_deg: normalizePanoDegrees(
        front + PANO_DIRECTION_OFFSETS.seam,
      ),
    },
    fov_deg: data.fovDeg,
    ts: timestamp.toISOString(),
  };
}
