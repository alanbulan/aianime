// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { prepareBeatVideoGeneration } from "@/modules/production/domain/beat-video-generation";
import {
  parseBeatVideoConfig,
  type BeatVideoConfigDraft,
} from "@/modules/production/domain/video-config";

function makeDraft(
  overrides: Partial<BeatVideoConfigDraft> = {},
): BeatVideoConfigDraft {
  return {
    ...parseBeatVideoConfig("", "9:16"),
    final_prompt: "镜头提示词",
    ...overrides,
  };
}

describe("beat video generation domain", () => {
  it("normalizes an advanced workflow from declared capabilities", () => {
    const sourceConfig = makeDraft({ resolution: "1080p" });
    const result = prepareBeatVideoGeneration({
      model: "video-model-a",
      beatNumber: 3,
      kind: "advanced",
      dirty: false,
      draft: sourceConfig,
      supportsSceneOptimize: false,
      resolutionOptions: ["720p"],
      sourceConfig,
    });

    expect(result.normalizedDraft?.resolution).toBe("720p");
    expect(result.draftChanged).toBe(true);
    expect(result.saveDraftBeforeGeneration).toBe(true);
    expect(result.command).toMatchObject({
      beatNum: 3,
      model: "video-model-a",
      resolution: "720p",
    });
  });

  it("maps a declared resolution tier to the matching exact size", () => {
    const sourceConfig = makeDraft({
      duration: 4,
      ratio: "9:16",
      resolution: "768p",
    });
    const result = prepareBeatVideoGeneration({
      model: "video-model-b",
      modelSelector: "cloud:video-model-b",
      beatNumber: 1,
      kind: "advanced",
      dirty: false,
      draft: sourceConfig,
      supportsSceneOptimize: true,
      modeOptions: ["first_frame", "multimodal_reference"],
      ratioOptions: ["16:9", "9:16", "1:1"],
      resolutionOptions: ["768p"],
      sizeOptions: ["1344x768", "768x1344", "1024x1024"],
      sourceConfig,
    });

    expect(result.command).toMatchObject({
      beatNum: 1,
      model: "video-model-b",
      modelSelector: "cloud:video-model-b",
      duration: 4,
      ratio: "9:16",
      resolution: "768x1344",
    });
  });

  it("builds a capability-normalized reference workflow command", () => {
    const sourceConfig = makeDraft({
      duration: 8,
      mode: "first_last_frame",
      ratio: "9:16",
      resolution: "480p",
    });
    const result = prepareBeatVideoGeneration({
      model: "video-model-c",
      beatNumber: 2,
      kind: "reference",
      draft: sourceConfig,
      ratioOptions: ["16:9", "9:16"],
      resolutionOptions: ["768p", "1080p"],
      sourceConfig,
    });

    expect(result.command).toMatchObject({
      beatNum: 2,
      model: "video-model-c",
      duration: 8,
      mode: "multimodal_reference",
      ratio: "9:16",
      resolution: "768p",
    });
    expect(JSON.parse(result.command.videoConfigJson ?? "{}")).toMatchObject({
      generate_audio: false,
      mode: "multimodal_reference",
      ratio: "9:16",
      resolution: "768p",
    });
    expect(result.saveDraftBeforeGeneration).toBe(false);
  });

  it("builds a basic workflow command without model-specific fields", () => {
    expect(
      prepareBeatVideoGeneration({
        model: "video-model-d",
        beatNumber: 5,
        kind: "basic",
      }).command,
    ).toEqual({
      beatNum: 5,
      model: "video-model-d",
    });
  });
});
