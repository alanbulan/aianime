// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  normalizeMultiAngleYaw,
  resolveMultiAngleGenerationPreset,
  type MultiAnglePresetKey,
} from "./multiAngle";

describe("multi-angle domain", () => {
  it("maps editor presets to generation presets", () => {
    const expected: Record<MultiAnglePresetKey, string> = {
      custom: "custom",
      fisheye: "fisheye",
      tilted: "oblique",
      frontTopDown: "front",
      frontBottomUp: "front_up",
      panoramaTopDown: "custom",
      backView: "back",
    };

    for (const [preset, generationPreset] of Object.entries(expected)) {
      expect(resolveMultiAngleGenerationPreset(preset as MultiAnglePresetKey)).toBe(
        generationPreset,
      );
    }
  });

  it("normalizes yaw to the existing (-180, 180] range", () => {
    expect(normalizeMultiAngleYaw(0)).toBe(0);
    expect(normalizeMultiAngleYaw(180)).toBe(180);
    expect(normalizeMultiAngleYaw(-180)).toBe(180);
    expect(normalizeMultiAngleYaw(181)).toBe(-179);
    expect(normalizeMultiAngleYaw(-181)).toBe(179);
  });
});
