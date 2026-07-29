// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { resolvePromptReferenceRoles } from "./referenceRoles";

describe("reference roles", () => {
  it("cleans markers and orders character, pose, style, then generic references", () => {
    expect(
      resolvePromptReferenceRoles(
        [
          "a portrait",
          "[ref:1=style]",
          "[ref:2=character]",
          "[ref:3=pose]",
        ].join("\n"),
        ["style.png", "character.png", "pose.png", "other.png"],
      ),
    ).toEqual({
      cleanedPrompt: "a portrait",
      references: ["character.png", "pose.png", "style.png", "other.png"],
      suffix: [
        "",
        "[reference roles]",
        "- reference 1: character anchor (preserve identity, pose, outfit)",
        "- reference 2: pose reference (body posture, gesture, framing)",
        "- reference 3: style reference (color palette, texture, lighting mood)",
        "- reference 4: additional reference",
      ].join("\n"),
    });
  });

  it("keeps the existing generic legend when references have no markers", () => {
    expect(
      resolvePromptReferenceRoles("a landscape", ["one.png", "two.png"]),
    ).toEqual({
      cleanedPrompt: "a landscape",
      references: ["one.png", "two.png"],
      suffix: [
        "",
        "[reference roles]",
        "- reference 1: additional reference",
        "- reference 2: additional reference",
      ].join("\n"),
    });
  });

  it("cleans markers without rendering a suffix when no references exist", () => {
    expect(
      resolvePromptReferenceRoles("a portrait\n[ref:1=character]", []),
    ).toEqual({
      cleanedPrompt: "a portrait",
      references: [],
      suffix: "",
    });
  });
});
