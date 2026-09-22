// Copyright (c) 2026 AI anime
import { clampFacePassSizeLevel } from './facePassGeometry';

/**
 * 人脸直过的参数契约，与上游 /api/detect 的查询参数一一对应：
 * `detector` / `noFace` / `singleEye` / `size` / `haarFallback`。
 * 归一化规则与上游 lib/detect-eyes.js 保持一致。
 *
 * `haarFallback` 取自上游线上版本（face.83zi.com）的语义：省略时只在 YuNet 未检出
 * 人脸才启用 Haar 补获；`1` 总是启用；`0` 关闭。GitHub 上的旧快照没有这个开关，
 * 兜底必跑且会把 YuNet 已找到的脸再遮一次，这里不沿用。
 */

export const FACE_PASS_DETECTORS = ['onnx', 'haar'] as const;
export type FacePassDetector = (typeof FACE_PASS_DETECTORS)[number];
export const FACE_PASS_DEFAULT_DETECTOR: FacePassDetector = 'onnx';
/** 上游 singleEye 默认开启、noFace 默认关闭。 */
export const FACE_PASS_DEFAULT_SINGLE_EYE = true;
export const FACE_PASS_DEFAULT_NO_FACE = false;
export const FACE_PASS_HAAR_FALLBACK_MODES = ['auto', 'always', 'off'] as const;
export type FacePassHaarFallback = (typeof FACE_PASS_HAAR_FALLBACK_MODES)[number];
export const FACE_PASS_DEFAULT_HAAR_FALLBACK: FacePassHaarFallback = 'auto';

export interface FacePassOptions {
  detector: FacePassDetector;
  noFace: boolean;
  singleEye: boolean;
  size: number;
  /** 仅 detector=onnx 生效。 */
  haarFallback: FacePassHaarFallback;
}

/** 上游 normalizeDetector：空值回落默认，'yunet' 视为 'onnx'，其余非法值报错。 */
export function normalizeFacePassDetector(raw: unknown): FacePassDetector {
  if (raw == null || String(raw).trim() === '') {
    return FACE_PASS_DEFAULT_DETECTOR;
  }
  const value = String(raw).trim().toLowerCase();
  if (value === 'yunet') {
    return 'onnx';
  }
  if (!(FACE_PASS_DETECTORS as readonly string[]).includes(value)) {
    throw new Error('detector 仅支持 onnx / haar');
  }
  return value as FacePassDetector;
}

/** 上游 `singleEye = opts.singleEye !== false`，即默认开启（每张脸只遮一只眼）。 */
export function normalizeFacePassSingleEye(raw: unknown): boolean {
  return raw !== false && raw !== 'false' && raw !== 0 && raw !== '0';
}

/** 上游 `noFace = !!opts.noFace`，即默认关闭。 */
export function normalizeFacePassNoFace(raw: unknown): boolean {
  return raw === true || raw === 'true' || raw === 1 || raw === '1';
}

/** 上游线上版：省略/auto → 仅 YuNet 未检出时；1/true/yes/always → 总是；0/false/no/off → 关闭。 */
export function normalizeFacePassHaarFallback(raw: unknown): FacePassHaarFallback {
  if (raw == null || String(raw).trim() === '') {
    return FACE_PASS_DEFAULT_HAAR_FALLBACK;
  }
  if (raw === true || raw === 1) {
    return 'always';
  }
  if (raw === false || raw === 0) {
    return 'off';
  }
  const value = String(raw).trim().toLowerCase();
  if (value === 'auto') {
    return 'auto';
  }
  if (value === '1' || value === 'true' || value === 'yes' || value === 'always') {
    return 'always';
  }
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
    return 'off';
  }
  throw new Error('haarFallback 仅支持 auto / always / off');
}

export function resolveFacePassOptions(
  options: Record<string, unknown>,
): FacePassOptions {
  return {
    detector: normalizeFacePassDetector(options.detector),
    noFace: normalizeFacePassNoFace(options.noFace),
    singleEye: normalizeFacePassSingleEye(options.singleEye),
    size: clampFacePassSizeLevel(options.size),
    haarFallback: normalizeFacePassHaarFallback(options.haarFallback),
  };
}
