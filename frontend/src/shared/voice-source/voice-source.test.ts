import { describe, expect, it } from "vitest";

import {
  resolvePresetVoiceModelSelection,
  resolveVoiceDesignModelSelection,
} from "@/shared/voice-source/voice-source";

describe("voice model selection", () => {
  it("resolves a design model and its default language", () => {
    expect(
      resolveVoiceDesignModelSelection(
        [{ value: "design-1", config: { defaultLanguage: "zh" } }],
        "design-1",
      ),
    ).toEqual({ selector: "design-1", language: "zh" });
  });

  it("resolves the declared default preset voice", () => {
    expect(
      resolvePresetVoiceModelSelection(
        [
          {
            value: "speech-1",
            voices: [
              { value: "first" },
              { value: "default", isDefault: true },
            ],
          },
        ],
        "speech-1",
      ),
    ).toEqual({ selector: "speech-1", voice: "default" });
  });

  it("rejects unknown selectors", () => {
    expect(resolveVoiceDesignModelSelection([], "missing")).toBeNull();
    expect(resolvePresetVoiceModelSelection([], "missing")).toBeNull();
  });
});
