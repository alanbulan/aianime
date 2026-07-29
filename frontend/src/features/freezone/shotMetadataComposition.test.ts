// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it } from "vitest";

import {
  resolveCurrentShotMetadataPrompt,
  shotMetadataState,
} from "./shotMetadataComposition";

describe("shot metadata composition", () => {
  afterEach(() => {
    shotMetadataState.clearShot();
  });

  it("combines the current canvas metadata with an inline node override", () => {
    shotMetadataState.hydrate({
      shot_type: "medium shot",
      angle: "eye level",
    });

    expect(
      resolveCurrentShotMetadataPrompt([
        "a portrait",
        "[shot]",
        "angle: low angle",
        "[/shot]",
      ].join("\n")),
    ).toEqual({
      cleanedPrompt: "a portrait",
      suffix: "\n[镜头参数]\n景别: medium shot\n镜头角度: low angle",
    });
  });
});
