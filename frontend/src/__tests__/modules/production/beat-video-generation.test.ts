// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { prepareBeatVideoGeneration } from "@/modules/production/domain/beat-video-generation";
import {
  parseSeedance2Config,
  type Seedance2ConfigDraft,
} from "@/modules/production/domain/video-config";

function makeDraft(
  overrides: Partial<Seedance2ConfigDraft> = {},
): Seedance2ConfigDraft {
  return {
    ...parseSeedance2Config("", "9:16"),
    final_prompt: "镜头提示词",
    ...overrides,
  };
}

describe("beat video generation domain", () => {
  it("normalizes and marks a changed Seedance2 draft for saving", () => {
    const sourceConfig = makeDraft({ resolution: "1080p" });
    const result = prepareBeatVideoGeneration({
      model: "seedance-2.0-fast",
      beatNumber: 3,
      kind: "seedance2",
      dirty: false,
      draft: sourceConfig,
      isValueStyle: false,
      resolutionOptions: ["720p"],
      sourceConfig,
    });

    expect(result.normalizedDraft?.resolution).toBe("720p");
    expect(result.draftChanged).toBe(true);
    expect(result.saveDraftBeforeGeneration).toBe(true);
    expect(result.command).toEqual({
      beatNum: 3,
      model: "seedance-2.0-fast",
    });
  });

  it("does not save an unchanged clean Seedance2 draft", () => {
    const sourceConfig = makeDraft({ resolution: "720p" });
    const result = prepareBeatVideoGeneration({
      model: "seedance-2.0-fast",
      beatNumber: 1,
      kind: "seedance2",
      dirty: false,
      draft: sourceConfig,
      isValueStyle: false,
      resolutionOptions: ["720p"],
      sourceConfig,
    });

    expect(result.draftChanged).toBe(false);
    expect(result.saveDraftBeforeGeneration).toBe(false);
  });

  it("builds a normalized HappyHorse command and embedded config", () => {
    const sourceConfig = makeDraft({
      duration: 8,
      mode: "first_last_frame",
      ratio: "9:16",
      resolution: "480p",
    });
    const result = prepareBeatVideoGeneration({
      model: "happyhorse-v1",
      beatNumber: 2,
      kind: "happyhorse",
      draft: sourceConfig,
      ratioOptions: ["16:9", "9:16"],
      resolutionOptions: ["720p", "1080p"],
      sourceConfig,
    });

    expect(result.command).toMatchObject({
      beatNum: 2,
      model: "happyhorse-v1",
      duration: 8,
      mode: "multimodal_reference",
      ratio: "9:16",
      resolution: "1080p",
    });
    expect(JSON.parse(result.command.seedance2ConfigJson ?? "{}")).toMatchObject({
      generate_audio: false,
      mode: "multimodal_reference",
      ratio: "9:16",
      resolution: "1080p",
    });
    expect(result.saveDraftBeforeGeneration).toBe(false);
  });

  it("builds a normalized Grok command and embedded config", () => {
    const sourceConfig = makeDraft({
      duration: 6,
      mode: "first_last_frame",
      ratio: "1:1",
      resolution: "1080p",
    });
    const result = prepareBeatVideoGeneration({
      model: "grok-video-v1",
      beatNumber: 4,
      kind: "grok",
      draft: sourceConfig,
      ratioOptions: ["16:9", "9:16"],
      resolutionOptions: ["480p", "720p"],
      sourceConfig,
    });

    expect(result.command).toMatchObject({
      beatNum: 4,
      model: "grok-video-v1",
      duration: 6,
      mode: "multimodal_reference",
      ratio: "16:9",
      resolution: "720p",
    });
    expect(JSON.parse(result.command.seedance2ConfigJson ?? "{}")).toMatchObject({
      generate_audio: false,
      mode: "multimodal_reference",
      ratio: "16:9",
      resolution: "720p",
    });
  });

  it("builds a plain legacy command", () => {
    expect(
      prepareBeatVideoGeneration({
        model: "legacy-model",
        beatNumber: 5,
        kind: "legacy",
      }).command,
    ).toEqual({
      beatNum: 5,
      model: "legacy-model",
    });
  });

  it("adds Seedance 1.5 duration and resolution to a legacy command", () => {
    expect(
      prepareBeatVideoGeneration({
        model: "seedance-1.5-pro",
        beatNumber: 6,
        kind: "legacy",
        seedance15: {
          duration: 9,
          resolution: "1080p",
        },
      }).command,
    ).toEqual({
      beatNum: 6,
      model: "seedance-1.5-pro",
      duration: 9,
      resolution: "1080p",
    });
  });
});
