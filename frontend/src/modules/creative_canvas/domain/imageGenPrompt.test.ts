// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { hasImageGenPromptOverride } from "./imageGenPrompt";

describe("image generation prompt helpers", () => {
  it("treats blank prompt text as no manual override", () => {
    expect(hasImageGenPromptOverride("")).toBe(false);
    expect(hasImageGenPromptOverride("   \n\t")).toBe(false);
    expect(hasImageGenPromptOverride("补充一点暖光")).toBe(true);
  });
});
