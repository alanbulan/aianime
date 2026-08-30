import { describe, expect, it } from "vitest";

import { imageModelSupportsQuality } from "./generation-credit";

describe("imageModelSupportsQuality", () => {
  it("keeps the image quality capability aligned for exact and GPT image models", () => {
    for (const model of [
      "lingshan-g2",
      "gpt-image-2",
      "image-2",
      "image-2-official",
      "openai/gpt-image-1",
    ]) {
      expect(imageModelSupportsQuality(model)).toBe(true);
    }
    expect(imageModelSupportsQuality("gemini-3-pro-image-preview")).toBe(false);
  });
});
