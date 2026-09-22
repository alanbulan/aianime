// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  FACE_PASS_DEFAULT_SIZE_LEVEL,
  buildMaskSquares,
  buildMaskSquaresForFaces,
  clampFacePassSizeLevel,
  clampSquare,
  eyeRectFromLandmark,
  pointInsideRect,
  resolveBorderThickness,
  resolveHaarMinFaceSide,
  resolveSquareSide,
  type FacePassDetection,
  type FacePassRect,
} from "./facePassGeometry";

const FACE_BOX: FacePassRect = { x: 100, y: 100, width: 200, height: 240 };
const RIGHT_EYE = { x: 160, y: 170 };
const LEFT_EYE = { x: 240, y: 172 };

function face(): FacePassDetection {
  return {
    box: FACE_BOX,
    score: 0.8,
    landmarks: [
      RIGHT_EYE,
      LEFT_EYE,
      { x: 200, y: 200 },
      { x: 175, y: 230 },
      { x: 225, y: 232 },
    ],
  };
}

describe("facePassGeometry", () => {
  it("clamps the size level into the supported range", () => {
    expect(clampFacePassSizeLevel(0)).toBe(1);
    expect(clampFacePassSizeLevel(11)).toBe(10);
    expect(clampFacePassSizeLevel("7")).toBe(7);
    expect(clampFacePassSizeLevel(5.4)).toBe(5);
    expect(clampFacePassSizeLevel("abc")).toBe(FACE_PASS_DEFAULT_SIZE_LEVEL);
    expect(clampFacePassSizeLevel(undefined)).toBe(FACE_PASS_DEFAULT_SIZE_LEVEL);
  });

  it("derives the eye rect from the inter-ocular distance", () => {
    // 瞳距 ≈ 80.02，side = round(80.02 × 0.55) = 44
    expect(eyeRectFromLandmark(RIGHT_EYE, FACE_BOX, LEFT_EYE)).toEqual({
      x: 138,
      y: 148,
      width: 44,
      height: 44,
    });
    // 缺少第二只眼时退化为按脸尺寸估算：round(240 × 0.18) = 43
    expect(eyeRectFromLandmark(RIGHT_EYE, FACE_BOX)).toEqual({
      x: 139,
      y: 149,
      width: 43,
      height: 43,
    });
    expect(
      eyeRectFromLandmark(
        { x: 0, y: 0 },
        { x: 0, y: 0, width: 1, height: 1 },
        { x: 1, y: 0 },
      ),
    ).toMatchObject({ width: 10, height: 10 });
  });

  it("interpolates the square side between the eye and the face", () => {
    // eyeBase = 44 × 1.1 = 48.4；faceBase = max(240) × 0.9 = 216
    // size=2 → eyeBase；size=10 → faceBase；size=5 → 48.4 + 167.6 × 0.375 ≈ 111
    expect(resolveSquareSide(44, 44, 2, 200, 240)).toBe(48);
    expect(resolveSquareSide(44, 44, 10, 200, 240)).toBe(216);
    expect(resolveSquareSide(44, 44, FACE_PASS_DEFAULT_SIZE_LEVEL, 200, 240)).toBe(111);
    // size=1 会略小于眼睛框
    expect(resolveSquareSide(44, 44, 1, 200, 240)).toBe(27);
    // 没有脸框时按 FACE_OVER_EYE 兜底
    expect(resolveSquareSide(44, 44, 10)).toBe(Math.round(48.4 * 3.2));
  });

  it("moves an out-of-bounds square back inside instead of cropping it", () => {
    // 上游是整体平移，因此边长保持 100 不变
    expect(clampSquare(10, 10, 100, 512, 512)).toEqual({ x: 0, y: 0, size: 100 });
    expect(clampSquare(500, 500, 100, 512, 512)).toEqual({
      x: 412,
      y: 412,
      size: 100,
    });
    // 方块比图还大时才被压到图内
    expect(clampSquare(50, 50, 800, 512, 512)).toEqual({
      x: 0,
      y: 0,
      size: 512,
    });
  });

  it("scales the Haar minimum face side with the short edge, never below 30px", () => {
    // 小图沿用上游的 30px 下限。
    expect(resolveHaarMinFaceSide(320, 240)).toBe(30);
    expect(resolveHaarMinFaceSide(500, 500)).toBe(30);
    // 1122×1402 的实拍图：短边 6% ≈ 67px，把 45–64px 的毛衣纹理误检挡在门外。
    expect(resolveHaarMinFaceSide(1122, 1402)).toBe(67);
    expect(resolveHaarMinFaceSide(1600, 900)).toBe(54);
    expect(resolveHaarMinFaceSide(0, 0)).toBe(30);
  });

  it("tests whether a point lies inside a rect, edges inclusive", () => {
    expect(pointInsideRect({ x: 200, y: 220 }, FACE_BOX)).toBe(true);
    expect(pointInsideRect({ x: 100, y: 100 }, FACE_BOX)).toBe(true);
    expect(pointInsideRect({ x: 300, y: 340 }, FACE_BOX)).toBe(true);
    expect(pointInsideRect({ x: 99, y: 220 }, FACE_BOX)).toBe(false);
    expect(pointInsideRect({ x: 200, y: 341 }, FACE_BOX)).toBe(false);
  });

  it("scales the border thickness from the short edge, bounded to 2-4", () => {
    expect(resolveBorderThickness(512, 512)).toBe(2);
    expect(resolveBorderThickness(1600, 900)).toBe(2);
    expect(resolveBorderThickness(4000, 3000)).toBe(4);
  });

  it("masks one eye per face by default and both when singleEye is off", () => {
    const squares = buildMaskSquares(face(), FACE_PASS_DEFAULT_SIZE_LEVEL, 512, 512);
    expect(squares).toHaveLength(1);
    expect(squares[0]).toEqual({ x: 105, y: 115, size: 111 });

    const both = buildMaskSquares(
      face(),
      FACE_PASS_DEFAULT_SIZE_LEVEL,
      512,
      512,
      false,
    );
    expect(both).toHaveLength(2);
    expect(both[0]).not.toEqual(both[1]);
  });

  it("skips faces without two landmarks and aggregates across faces", () => {
    const incomplete: FacePassDetection = {
      box: FACE_BOX,
      score: 0.8,
      landmarks: [{ x: 160, y: 170 }],
    };
    expect(buildMaskSquares(incomplete, 5, 512, 512)).toEqual([]);
    expect(
      buildMaskSquaresForFaces([face(), face()], 5, 512, 512, false),
    ).toHaveLength(4);
  });
});
