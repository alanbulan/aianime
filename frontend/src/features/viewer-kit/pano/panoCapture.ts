// Copyright (c) 2026 AI anime
import type { PanoCaptureResult, PanoViewerManifest } from "./panoManifest";

export type PanoCaptureAspect = "16:9" | "4:3" | "1:1" | "9:16" | "2:3";

export const PANO_CAPTURE_ASPECTS: Array<{ value: PanoCaptureAspect; label: string; ratio: number }> = [
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "9:16", label: "9:16", ratio: 9 / 16 },
  { value: "2:3", label: "2:3", ratio: 2 / 3 },
];

export const FOV_MIN = 5;
export const FOV_MAX = 170;

export const PANO_DEGREES_TO_RADIANS = Math.PI / 180;

export interface PanoCropFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampPanoFov(value: number): number {
  return Math.max(FOV_MIN, Math.min(FOV_MAX, value));
}

export function fovToZoom(fov: number): number {
  const clamped = clampPanoFov(fov);
  return ((FOV_MAX - clamped) / (FOV_MAX - FOV_MIN)) * 100;
}

export function zoomToFov(zoom: number): number {
  return FOV_MAX - (zoom / 100) * (FOV_MAX - FOV_MIN);
}

export function fovToFocal(fov: number): number {
  const clamped = clampPanoFov(fov);
  return Math.round(
    18 / Math.tan((clamped / 2) * PANO_DEGREES_TO_RADIANS),
  );
}

export function normalizePanoDegrees(value: number): number {
  return ((Number(value) + 540) % 360) - 180;
}

export function canvasCropRectFromFrame(
  frame: PanoCropFrame,
  viewport: { width: number; height: number },
  canvas: { width: number; height: number },
): PanoCropFrame {
  const scaleX = canvas.width / Math.max(1, viewport.width);
  const scaleY = canvas.height / Math.max(1, viewport.height);
  const x = Math.max(0, Math.round(frame.x * scaleX));
  const y = Math.max(0, Math.round(frame.y * scaleY));
  const width = Math.max(1, Math.round(frame.width * scaleX));
  const height = Math.max(1, Math.round(frame.height * scaleY));
  return {
    x: Math.min(x, Math.max(0, canvas.width - 1)),
    y: Math.min(y, Math.max(0, canvas.height - 1)),
    width: Math.min(width, canvas.width - x),
    height: Math.min(height, canvas.height - y),
  };
}

export function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function waitFrames(count = 3): Promise<void> {
  return new Promise<void>((resolve) => {
    let remaining = count;
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function aspectRatioValue(aspect: PanoCaptureAspect): number {
  return PANO_CAPTURE_ASPECTS.find((item) => item.value === aspect)?.ratio ?? 16 / 9;
}

export function centeredPanoCropRect(
  width: number,
  height: number,
  targetRatio: number,
): PanoCropFrame {
  const sourceRatio = width / Math.max(1, height);
  let cropWidth = width;
  let cropHeight = height;
  if (sourceRatio > targetRatio) {
    cropWidth = Math.round(height * targetRatio);
  } else {
    cropHeight = Math.round(width / targetRatio);
  }
  return {
    x: Math.max(0, Math.round((width - cropWidth) / 2)),
    y: Math.max(0, Math.round((height - cropHeight) / 2)),
    width: cropWidth,
    height: cropHeight,
  };
}

async function cropCanvasToRect(
  canvas: HTMLCanvasElement,
  rect: PanoCropFrame,
): Promise<{ blob: Blob; width: number; height: number; crop: PanoCaptureResult["crop"] }> {
  const out = document.createElement("canvas");
  out.width = rect.width;
  out.height = rect.height;
  const ctx = out.getContext("2d");
  if (!ctx) {
    throw new Error("canvas 2d context unavailable");
  }
  ctx.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (value) => {
        if (value) resolve(value);
        else reject(new Error("canvas toBlob returned null"));
      },
      "image/png",
      0.95,
    );
  });
  return {
    blob,
    width: rect.width,
    height: rect.height,
    crop: {
      ...rect,
      coordinate_space: "viewer_canvas",
    },
  };
}

export async function cropCanvasToAspect(
  canvas: HTMLCanvasElement,
  aspect: PanoCaptureAspect,
): Promise<{ blob: Blob; width: number; height: number; crop: PanoCaptureResult["crop"] }> {
  return cropCanvasToRect(
    canvas,
    centeredPanoCropRect(
      canvas.width,
      canvas.height,
      aspectRatioValue(aspect),
    ),
  );
}

export async function cropCanvasToFrame(
  canvas: HTMLCanvasElement,
  frame: PanoCropFrame,
  viewport: { width: number; height: number },
): Promise<{ blob: Blob; width: number; height: number; crop: PanoCaptureResult["crop"] }> {
  return cropCanvasToRect(
    canvas,
    canvasCropRectFromFrame(frame, viewport, { width: canvas.width, height: canvas.height }),
  );
}

export function panoCorrectionConfig(manifest: PanoViewerManifest) {
  const correction = manifest.correction;
  return {
    defaultYaw: `${correction.front_yaw_deg || 0}deg`,
    sphereCorrection: {
      pan: `${correction.sphere_correction_deg.yaw || 0}deg`,
      tilt: `${correction.sphere_correction_deg.pitch || 0}deg`,
      roll: `${correction.sphere_correction_deg.roll || 0}deg`,
    },
  };
}
