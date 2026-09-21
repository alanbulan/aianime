// Copyright (c) 2026 AI anime

/**
 * 人脸直过的纯几何计算。
 *
 * 公式与上游 seedance2-real-people 的 lib/detect-eyes.js 逐项对齐：
 * 先由眼关键点构造「眼睛框」，再按 size 档位在「眼睛大小」与「脸大小」之间线性插值，
 * 最后把方块整体平移回图内（不裁剪）。这里不含任何推理逻辑。
 */

export interface FacePassRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FacePassPoint {
  x: number;
  y: number;
}

export interface FacePassDetection {
  box: FacePassRect;
  score: number;
  /** YuNet 五关键点顺序：右眼、左眼、鼻尖、右嘴角、左嘴角。 */
  landmarks: FacePassPoint[];
}

/** 遮挡方块（上游为正方形，用 size 表示边长）。 */
export interface FacePassSquare {
  x: number;
  y: number;
  size: number;
}

export const FACE_PASS_MIN_SIZE_LEVEL = 1;
export const FACE_PASS_MAX_SIZE_LEVEL = 10;
export const FACE_PASS_DEFAULT_SIZE_LEVEL = 5;
/** 无法获得脸框时，用人眼框估算脸边长的倍数（上游 FACE_OVER_EYE）。 */
const FACE_OVER_EYE = 3.2;
/** 由瞳距估算眼睛框边长：iod × 0.55（上游 eyeRectFromLandmark）。 */
const EYE_SIDE_FROM_IOD = 0.55;
/** 缺少第二个眼关键点时的脸尺寸比例。 */
const EYE_SIDE_FROM_FACE_RATIO = 0.18;
const MIN_EYE_SIDE = 10;

export function clampFacePassSizeLevel(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return FACE_PASS_DEFAULT_SIZE_LEVEL;
  }
  return Math.min(
    FACE_PASS_MAX_SIZE_LEVEL,
    Math.max(FACE_PASS_MIN_SIZE_LEVEL, Math.round(numeric)),
  );
}

/** 由眼关键点构造遮挡用的眼睛框（上游 eyeRectFromLandmark）。 */
export function eyeRectFromLandmark(
  point: FacePassPoint,
  faceBox: FacePassRect,
  otherPoint?: FacePassPoint,
): FacePassRect {
  const side = otherPoint
    ? Math.max(
        MIN_EYE_SIDE,
        Math.round(
          Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y) *
            EYE_SIDE_FROM_IOD,
        ),
      )
    : Math.max(
        MIN_EYE_SIDE,
        Math.round(
          Math.max(faceBox.width, faceBox.height) * EYE_SIDE_FROM_FACE_RATIO,
        ),
      );
  return {
    x: Math.round(point.x - side / 2),
    y: Math.round(point.y - side / 2),
    width: side,
    height: side,
  };
}

/**
 * size=2 → 约等于当前眼睛框；size=10 → 约等于一张脸；其间线性插值（上游 squareSide）。
 * size=1 会略小于眼睛框。
 */
export function resolveSquareSide(
  eyeWidth: number,
  eyeHeight: number,
  sizeLevel: unknown,
  faceWidth = 0,
  faceHeight = 0,
): number {
  const eyeBase = Math.max(1, Math.max(eyeWidth, eyeHeight) * 1.1);
  const faceBase =
    faceWidth > 0 && faceHeight > 0
      ? Math.max(eyeBase, Math.max(faceWidth, faceHeight) * 0.9)
      : eyeBase * FACE_OVER_EYE;
  const level = clampFacePassSizeLevel(sizeLevel);
  const ratio = (level - 2) / (FACE_PASS_MAX_SIZE_LEVEL - 2);
  return Math.max(1, Math.round(eyeBase + (faceBase - eyeBase) * ratio));
}

/** 把方块整体平移回图内，保持正方形完整（上游 clampSquare，不做裁剪）。 */
export function clampSquare(
  centerX: number,
  centerY: number,
  side: number,
  imageWidth: number,
  imageHeight: number,
): FacePassSquare {
  let left = Math.round(centerX - side / 2);
  let top = Math.round(centerY - side / 2);
  left = Math.max(0, Math.min(left, imageWidth - side));
  top = Math.max(0, Math.min(top, imageHeight - side));
  const size = Math.min(side, imageWidth - left, imageHeight - top);
  return { x: left, y: top, size: Math.max(1, size) };
}

/** 黑框线宽：短边 / 400，限制在 2–4（上游 borderThickness）。 */
export function resolveBorderThickness(
  imageWidth: number,
  imageHeight: number,
): number {
  const shortEdge = Math.min(imageWidth, imageHeight);
  return Math.max(2, Math.min(4, Math.round(shortEdge / 400)));
}

/** 计算一张脸要遮挡的方块；singleEye 默认开启，即每张脸只遮右眼。 */
export function buildMaskSquares(
  face: FacePassDetection,
  sizeLevel: unknown,
  imageWidth: number,
  imageHeight: number,
  singleEye = true,
): FacePassSquare[] {
  const [rightEyePoint, leftEyePoint] = face.landmarks;
  if (!rightEyePoint || !leftEyePoint) {
    return [];
  }
  const rightEye = eyeRectFromLandmark(rightEyePoint, face.box, leftEyePoint);
  const leftEye = eyeRectFromLandmark(leftEyePoint, face.box, rightEyePoint);
  const picks = singleEye ? [rightEye] : [rightEye, leftEye];
  return picks.map((eyeRect) =>
    clampSquare(
      eyeRect.x + eyeRect.width / 2,
      eyeRect.y + eyeRect.height / 2,
      resolveSquareSide(
        eyeRect.width,
        eyeRect.height,
        sizeLevel,
        face.box.width,
        face.box.height,
      ),
      imageWidth,
      imageHeight,
    ),
  );
}

export function buildMaskSquaresForFaces(
  faces: readonly FacePassDetection[],
  sizeLevel: unknown,
  imageWidth: number,
  imageHeight: number,
  singleEye = true,
): FacePassSquare[] {
  return faces.flatMap((face) =>
    buildMaskSquares(face, sizeLevel, imageWidth, imageHeight, singleEye),
  );
}

/** 处理/输出长边上限，只缩不放（上游 MAX_EDGE）。 */
export const FACE_PASS_MAX_EDGE = 1600;

export function fitWithinMaxEdge(
  width: number,
  height: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= FACE_PASS_MAX_EDGE) {
    return { width, height };
  }
  const ratio = FACE_PASS_MAX_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}
