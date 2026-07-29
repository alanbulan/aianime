// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  hasActiveShotMetadata,
  mergeShotMetadata,
  parseInlineShotBlock,
  renderShotMetadataForPrompt,
} from "./shotMetadata";

describe("shot metadata", () => {
  it("detects active fields including custom metadata", () => {
    expect(hasActiveShotMetadata({})).toBe(false);
    expect(hasActiveShotMetadata({ angle: "  " })).toBe(false);
    expect(hasActiveShotMetadata({ angle: "low angle" })).toBe(true);
    expect(hasActiveShotMetadata({ extra: { lens_mm: "35" } })).toBe(true);
  });

  it("parses and removes an inline shot override", () => {
    expect(
      parseInlineShotBlock([
        "a portrait",
        "",
        "[shot]",
        "angle: low angle",
        "mood: tense",
        "lens_mm: 35",
        "[/shot]",
      ].join("\n")),
    ).toEqual({
      cleaned: "a portrait",
      override: {
        angle: "low angle",
        mood: "tense",
        extra: { lens_mm: "35" },
      },
    });
  });

  it("merges node overrides over canvas defaults", () => {
    expect(
      mergeShotMetadata(
        {
          shot_type: "medium shot",
          angle: "eye level",
          extra: { lens_mm: "50", fps: "24" },
        },
        {
          angle: "low angle",
          extra: { lens_mm: "35" },
        },
      ),
    ).toEqual({
      shot_type: "medium shot",
      angle: "low angle",
      extra: { lens_mm: "35", fps: "24" },
    });
  });

  it("renders recognized and custom fields into the prompt suffix", () => {
    expect(
      renderShotMetadataForPrompt({
        shot_type: "中景",
        angle: "仰拍",
        extra: { lens_mm: "35" },
      }),
    ).toBe("\n[镜头参数]\n景别: 中景\n镜头角度: 仰拍\nlens_mm: 35");
    expect(renderShotMetadataForPrompt({})).toBe("");
  });
});
