// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  FACE_PASS_DEFAULT_DETECTOR,
  FACE_PASS_DEFAULT_HAAR_FALLBACK,
  FACE_PASS_DEFAULT_NO_FACE,
  FACE_PASS_DEFAULT_SINGLE_EYE,
  normalizeFacePassDetector,
  normalizeFacePassHaarFallback,
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

  it("normalizes haarFallback like the upstream live API (omit=auto, 1=always, 0=off)", () => {
    expect(FACE_PASS_DEFAULT_HAAR_FALLBACK).toBe("auto");
    for (const raw of [undefined, null, "", "  ", "auto", "AUTO"]) {
      expect(normalizeFacePassHaarFallback(raw)).toBe("auto");
    }
    for (const raw of [true, 1, "1", "true", "yes", "always", "Always"]) {
      expect(normalizeFacePassHaarFallback(raw)).toBe("always");
    }
    for (const raw of [false, 0, "0", "false", "no", "off"]) {
      expect(normalizeFacePassHaarFallback(raw)).toBe("off");
    }
    expect(() => normalizeFacePassHaarFallback("maybe")).toThrow();
  });

  it("resolves full options and clamps the size into range", () => {
    expect(resolveFacePassOptions({})).toEqual({
      detector: "onnx",
      noFace: false,
      singleEye: true,
      size: 5,
      haarFallback: "auto",
    });
    expect(
      resolveFacePassOptions({
        detector: "haar",
        noFace: true,
        singleEye: false,
        size: 99,
        haarFallback: "always",
      }),
    ).toEqual({
      detector: "haar",
      noFace: true,
      singleEye: false,
      size: 10,
      haarFallback: "always",
    });
    expect(resolveFacePassOptions({ size: "abc" })).toMatchObject({ size: 5 });
  });
});
