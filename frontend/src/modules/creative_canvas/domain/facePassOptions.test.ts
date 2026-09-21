// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  FACE_PASS_DEFAULT_DETECTOR,
  FACE_PASS_DEFAULT_NO_FACE,
  FACE_PASS_DEFAULT_SINGLE_EYE,
  normalizeFacePassDetector,
  normalizeFacePassNoFace,
  normalizeFacePassSingleEye,
  resolveFacePassOptions,
} from "./facePassOptions";

describe("facePassOptions", () => {
  it("normalizes the detector like upstream", () => {
    expect(normalizeFacePassDetector(undefined)).toBe(FACE_PASS_DEFAULT_DETECTOR);
    expect(normalizeFacePassDetector("")).toBe(FACE_PASS_DEFAULT_DETECTOR);
    expect(normalizeFacePassDetector("Haar")).toBe("haar");
    // 上游把 'yunet' 也视为 onnx
    expect(normalizeFacePassDetector("yunet")).toBe("onnx");
    expect(() => normalizeFacePassDetector("gpu")).toThrow();
  });

  it("defaults singleEye on and noFace off", () => {
    expect(normalizeFacePassSingleEye(undefined)).toBe(
      FACE_PASS_DEFAULT_SINGLE_EYE,
    );
    expect(normalizeFacePassSingleEye(false)).toBe(false);
    expect(normalizeFacePassSingleEye("false")).toBe(false);
    expect(normalizeFacePassSingleEye(0)).toBe(false);
    expect(normalizeFacePassSingleEye(true)).toBe(true);

    expect(normalizeFacePassNoFace(undefined)).toBe(FACE_PASS_DEFAULT_NO_FACE);
    expect(normalizeFacePassNoFace(true)).toBe(true);
    expect(normalizeFacePassNoFace("1")).toBe(true);
    expect(normalizeFacePassNoFace(false)).toBe(false);
  });

  it("resolves full options and clamps the size into range", () => {
    expect(resolveFacePassOptions({})).toEqual({
      detector: "onnx",
      noFace: false,
      singleEye: true,
      size: 5,
    });
    expect(
      resolveFacePassOptions({
        detector: "haar",
        noFace: true,
        singleEye: false,
        size: 99,
      }),
    ).toEqual({ detector: "haar", noFace: true, singleEye: false, size: 10 });
    expect(resolveFacePassOptions({ size: "abc" })).toMatchObject({ size: 5 });
  });
});
