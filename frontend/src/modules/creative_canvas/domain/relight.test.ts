// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  buildCanvasRelightPrompt,
  resolveCanvasRelightKeyLightDirection,
} from "./relight";

describe("relight domain", () => {
  it("accepts supported light directions and defaults invalid values", () => {
    expect(resolveCanvasRelightKeyLightDirection("left")).toBe("left");
    expect(resolveCanvasRelightKeyLightDirection("back")).toBe("back");
    expect(resolveCanvasRelightKeyLightDirection("diagonal")).toBe("front");
    expect(resolveCanvasRelightKeyLightDirection(null)).toBe("front");
  });

  it("combines enabled smart-mode prompts in their existing order", () => {
    expect(
      buildCanvasRelightPrompt({
        enabled: true,
        prompt: "keep the face readable",
        presetPrompt: "golden hour",
      }),
    ).toBe("keep the face readable\ngolden hour");
    expect(
      buildCanvasRelightPrompt({
        enabled: false,
        prompt: "ignored",
        presetPrompt: "ignored",
      }),
    ).toBe("");
  });
});
