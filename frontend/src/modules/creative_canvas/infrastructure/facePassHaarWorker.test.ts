// Copyright (c) 2026 AI anime
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import * as domainGeometry from "../domain/facePassGeometry";

/**
 * facePassHaarWorker.js 是原生 classic worker，不能 import domain 模块，
 * 因此内嵌了一份几何实现。这里把两份实现按同一组输入逐函数比对，
 * 防止其中一份被改动后静默分歧。
 */
const require = createRequire(import.meta.url);
const workerGeometry = require("./facePassHaarWorker.js") as {
  clampFacePassSizeLevel: typeof domainGeometry.clampFacePassSizeLevel;
  eyeRectFromLandmark: typeof domainGeometry.eyeRectFromLandmark;
  resolveSquareSide: typeof domainGeometry.resolveSquareSide;
  clampSquare: typeof domainGeometry.clampSquare;
  resolveBorderThickness: typeof domainGeometry.resolveBorderThickness;
  fitWithinMaxEdge: typeof domainGeometry.fitWithinMaxEdge;
  buildMaskSquares: typeof domainGeometry.buildMaskSquares;
};

const FACE_BOX = { x: 100, y: 100, width: 200, height: 240 };
const RIGHT_EYE = { x: 160, y: 170 };
const LEFT_EYE = { x: 240, y: 172 };
const FACE: domainGeometry.FacePassDetection = {
  box: FACE_BOX,
  score: 0.8,
  landmarks: [RIGHT_EYE, LEFT_EYE, { x: 200, y: 200 }, { x: 175, y: 230 }, { x: 225, y: 232 }],
};

describe("facePassHaarWorker geometry parity", () => {
  it("clamps size levels identically", () => {
    for (const value of [-3, 0, 1, 2.6, 5, 9.5, 10, 42, "7", "abc", undefined, null]) {
      expect(workerGeometry.clampFacePassSizeLevel(value)).toBe(
        domainGeometry.clampFacePassSizeLevel(value),
      );
    }
  });

  it("derives eye rects identically", () => {
    expect(workerGeometry.eyeRectFromLandmark(RIGHT_EYE, FACE_BOX, LEFT_EYE)).toEqual(
      domainGeometry.eyeRectFromLandmark(RIGHT_EYE, FACE_BOX, LEFT_EYE),
    );
    expect(workerGeometry.eyeRectFromLandmark(RIGHT_EYE, FACE_BOX)).toEqual(
      domainGeometry.eyeRectFromLandmark(RIGHT_EYE, FACE_BOX),
    );
  });

  it("interpolates square sides identically across all levels", () => {
    for (let level = 1; level <= 10; level += 1) {
      expect(workerGeometry.resolveSquareSide(44, 44, level, 200, 240)).toBe(
        domainGeometry.resolveSquareSide(44, 44, level, 200, 240),
      );
      expect(workerGeometry.resolveSquareSide(44, 40, level, 0, 0)).toBe(
        domainGeometry.resolveSquareSide(44, 40, level, 0, 0),
      );
    }
  });

  it("clamps squares, border thickness and max edge identically", () => {
    for (const [cx, cy, side] of [
      [10, 10, 100],
      [500, 500, 100],
      [50, 50, 800],
      [256, 256, 33],
    ]) {
      expect(workerGeometry.clampSquare(cx, cy, side, 512, 512)).toEqual(
        domainGeometry.clampSquare(cx, cy, side, 512, 512),
      );
    }
    for (const [w, h] of [
      [512, 512],
      [1600, 900],
      [4000, 3000],
      [3000, 4000],
      [1, 1],
    ]) {
      expect(workerGeometry.resolveBorderThickness(w, h)).toBe(
        domainGeometry.resolveBorderThickness(w, h),
      );
      expect(workerGeometry.fitWithinMaxEdge(w, h)).toEqual(
        domainGeometry.fitWithinMaxEdge(w, h),
      );
    }
  });

  it("builds identical mask squares for single-eye and both-eyes modes", () => {
    for (const singleEye of [true, false]) {
      for (const level of [1, 5, 10]) {
        expect(workerGeometry.buildMaskSquares(FACE, level, 512, 512, singleEye)).toEqual(
          domainGeometry.buildMaskSquares(FACE, level, 512, 512, singleEye),
        );
      }
    }
    const incomplete = { ...FACE, landmarks: [RIGHT_EYE] };
    expect(workerGeometry.buildMaskSquares(incomplete, 5, 512, 512, true)).toEqual([]);
  });
});
