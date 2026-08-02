// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  clampDuration,
  getSeedance2ConfigSaveKey,
  grokVideoRatioOptionsForModel,
  grokVideoResolutionOptionsForModel,
  happyHorseRatioOptionsForModel,
  happyHorseResolutionOptionsForModel,
  isSeedance15ProModel,
  isSeedance2ValueModel,
  normalizeGrokVideoDraftForModel,
  normalizeHappyHorseDraftForModel,
  normalizeSeedance2DraftForModel,
  parseSeedance2Config,
  sameSeedance2Config,
  seedance2DefaultRatioForProjectAspect,
  seedance2ResolutionOptionsForModel,
  serializeGrokVideoConfig,
  serializeHappyHorseConfig,
  serializeSeedance2Config,
  videoModelDisplayLabel,
  videoDurationBoundsForModel,
} from "@/modules/production/public";

describe("Production video config domain", () => {
  it("parses legacy values into the canonical draft", () => {
    const draft = parseSeedance2Config(
      JSON.stringify({
        legacy_field: "keep",
        mode: "first_frame",
        mode_user_set: false,
        duration: "6.6",
        resolution: "invalid",
        ratio: "invalid",
        generate_audio: false,
        human_review: false,
        text_overlay: { enabled: true, kind: "caption" },
      }),
      "16:9",
    );

    expect(draft).toMatchObject({
      mode: "multimodal_reference",
      mode_user_set: false,
      duration: 7,
      resolution: "720p",
      ratio: "16:9",
      generate_audio: true,
      generate_audio_user_set: false,
      human_review: true,
      human_review_user_set: false,
      text_overlay: {
        enabled: true,
        kind: "subtitle",
        placement: "画面下方居中",
        timing: "全片持续",
        style: "干净易读",
      },
    });
    expect(draft.raw.legacy_field).toBe("keep");
    expect(parseSeedance2Config("legacy prompt").final_prompt).toBe("legacy prompt");
  });

  it("resolves model capabilities from bare catalog SKUs", () => {
    expect(isSeedance15ProModel("seedance-1.5-pro")).toBe(true);
    expect(isSeedance2ValueModel("SEEDANCE-2.0-FAST-VALUE")).toBe(true);
    expect(seedance2ResolutionOptionsForModel("seedance-2.0")).toEqual([
      "480p",
      "720p",
      "1080p",
    ]);
    expect(seedance2ResolutionOptionsForModel("unknown")).toEqual(["480p", "720p"]);
    expect(seedance2DefaultRatioForProjectAspect("2:3")).toBe("9:16");
    expect(seedance2DefaultRatioForProjectAspect("16:9")).toBe("16:9");
    expect(
      videoModelDisplayLabel(
        "seedance-2.0-fast",
        new Map([["known", "已配置模型"]]),
      ),
    ).toBe("Seedance 2.0-fast");
    expect(
      videoModelDisplayLabel(
        "known",
        new Map([["known", "已配置模型"]]),
      ),
    ).toBe("已配置模型");
  });

  it("filters catalog-provided HappyHorse and Grok options", () => {
    const model = {
      resolutionOptions: ["bad", "480p", "1080p", "720p"],
      ratioOptions: ["bad", "2:3", "4:3", "16:9"],
    };

    expect(happyHorseResolutionOptionsForModel(model)).toEqual(["1080p", "720p"]);
    expect(happyHorseRatioOptionsForModel(model)).toEqual(["4:3", "16:9"]);
    expect(grokVideoResolutionOptionsForModel(model)).toEqual(["480p", "720p"]);
    expect(grokVideoRatioOptionsForModel(model)).toEqual(["2:3", "16:9"]);
    expect(happyHorseResolutionOptionsForModel(null)).toEqual(["720p", "1080p"]);
    expect(grokVideoRatioOptionsForModel(null)).toEqual([
      "16:9",
      "9:16",
      "1:1",
      "2:3",
      "3:2",
    ]);
  });

  it("normalizes duration bounds and values", () => {
    expect(videoDurationBoundsForModel({ minDuration: 4.4, maxDuration: 12.2 })).toEqual({
      min: 4,
      max: 12,
    });
    expect(videoDurationBoundsForModel({ minDuration: 8, maxDuration: 4 })).toEqual({
      min: 8,
      max: 15,
    });
    expect(clampDuration("12.7", { min: 4, max: 12 })).toBe(12);
    expect(clampDuration("invalid", { min: 8, max: 12 })).toBe(8);
  });

  it("normalizes Seedance value models without changing stable drafts", () => {
    const draft = parseSeedance2Config(
      JSON.stringify({ resolution: "1080p", scene_optimize: "" }),
    );
    const normalized = normalizeSeedance2DraftForModel(
      draft,
      ["480p", "720p"],
      "seedance-2.0-fast-value",
      true,
    );

    expect(normalized).toMatchObject({ resolution: "720p", scene_optimize: "realistic" });
    const stable = { ...normalized, scene_optimize: "" as const };
    expect(
      normalizeSeedance2DraftForModel(stable, ["480p", "720p"], "seedance", false),
    ).toBe(stable);
  });

  it("normalizes HappyHorse and Grok unsupported settings", () => {
    const draft = {
      ...parseSeedance2Config(
        JSON.stringify({
          mode: "first_last_frame",
          mode_user_set: true,
          resolution: "480p",
          ratio: "2:3",
          return_last_frame: true,
          scene_optimize: "anime",
        }),
      ),
      generate_audio: true,
      human_review: true,
    };

    expect(
      normalizeHappyHorseDraftForModel(draft, ["720p", "1080p"], ["16:9", "9:16"]),
    ).toMatchObject({
      mode: "multimodal_reference",
      mode_user_set: true,
      resolution: "1080p",
      ratio: "16:9",
      generate_audio: false,
      return_last_frame: false,
      scene_optimize: "",
      human_review: false,
    });
    expect(
      normalizeGrokVideoDraftForModel(draft, ["720p", "480p"], ["16:9", "3:2"]),
    ).toMatchObject({
      mode: "multimodal_reference",
      resolution: "480p",
      ratio: "16:9",
      generate_audio: false,
      return_last_frame: false,
      scene_optimize: "",
      human_review: false,
    });
  });

  it("serializes prompts and model-specific constraints without losing raw fields", () => {
    const previous = parseSeedance2Config(
      JSON.stringify({
        legacy_field: "keep",
        prompt_source: "auto",
        final_prompt: "old prompt",
      }),
    );
    const draft = {
      ...previous,
      resolution: "1080p" as const,
      ratio: "4:3" as const,
      prompt_guidance: "  guidance  ",
      final_prompt: "new @hero ",
      text_overlay: {
        ...previous.text_overlay,
        enabled: true,
        content: "  copy  ",
        style: "  bold  ",
        speaker: "  hero  ",
      },
    };

    expect(serializeSeedance2Config(draft, previous)).toMatchObject({
      legacy_field: "keep",
      generate_audio: true,
      prompt_guidance: "guidance",
      final_prompt: "new @hero ",
      prompt_source: "manual",
      text_overlay: {
        enabled: false,
        content: "copy",
        style: "bold",
        speaker: "hero",
      },
    });
    expect(serializeHappyHorseConfig(draft, previous)).toMatchObject({
      resolution: "1080p",
      ratio: "4:3",
      generate_audio: false,
      human_review: false,
    });
    expect(serializeGrokVideoConfig(draft, previous)).toMatchObject({
      resolution: "720p",
      ratio: "16:9",
      generate_audio: false,
      human_review: false,
    });
  });

  it("compares persisted fields and builds a deterministic save key", () => {
    const draft = parseSeedance2Config(JSON.stringify({ final_prompt: "prompt" }));
    const metadataOnlyChange = {
      ...draft,
      raw: { replaced: true },
      prompt_source: "manual",
    };

    expect(sameSeedance2Config(draft, metadataOnlyChange)).toBe(true);
    expect(getSeedance2ConfigSaveKey(3, { mode: "first_frame" })).toBe(
      '3:{"mode":"first_frame"}',
    );
  });
});
