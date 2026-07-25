// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  clampDuration,
  getSeedance2ConfigSaveKey,
  grokVideoRatioOptionsForBackend,
  grokVideoResolutionOptionsForBackend,
  happyHorseRatioOptionsForBackend,
  happyHorseResolutionOptionsForBackend,
  isSeedance15ProBackend,
  isSeedance2ValueBackend,
  normalizeGrokVideoDraftForBackend,
  normalizeHappyHorseDraftForBackend,
  normalizeSeedance2DraftForBackend,
  parseSeedance2Config,
  sameSeedance2Config,
  seedance2DefaultRatioForProjectAspect,
  seedance2DurationBoundsForBackend,
  seedance2ModelFromBackend,
  seedance2ResolutionOptionsForBackend,
  serializeGrokVideoConfig,
  serializeHappyHorseConfig,
  serializeSeedance2Config,
  videoBackendDisplayLabel,
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

  it("resolves backend models and Seedance capabilities", () => {
    expect(seedance2ModelFromBackend(" HuiMengi_Seedance-1.5-Pro ")).toBe(
      "seedance-1.5-pro",
    );
    expect(isSeedance15ProBackend("newapi_seedance_pro")).toBe(true);
    expect(isSeedance2ValueBackend("HUIMENG_SEEDANCE-2.0-FAST-VALUE")).toBe(true);
    expect(seedance2ResolutionOptionsForBackend("newapi_seedance-2.0")).toEqual([
      "480p",
      "720p",
      "1080p",
    ]);
    expect(seedance2ResolutionOptionsForBackend("unknown")).toEqual(["480p", "720p"]);
    expect(seedance2DefaultRatioForProjectAspect("2:3")).toBe("9:16");
    expect(seedance2DefaultRatioForProjectAspect("16:9")).toBe("16:9");
    expect(
      videoBackendDisplayLabel(
        "newapi_seedance-2.0-fast",
        new Map([["known", "已配置模型"]]),
      ),
    ).toBe("Seedance 2.0-fast");
    expect(
      videoBackendDisplayLabel(
        "known",
        new Map([["known", "已配置模型"]]),
      ),
    ).toBe("已配置模型");
  });

  it("filters backend-provided HappyHorse and Grok options", () => {
    const backend = {
      resolution_options: ["bad", "480p", "1080p", "720p"],
      ratio_options: ["bad", "2:3", "4:3", "16:9"],
    };

    expect(happyHorseResolutionOptionsForBackend(backend)).toEqual(["1080p", "720p"]);
    expect(happyHorseRatioOptionsForBackend(backend)).toEqual(["4:3", "16:9"]);
    expect(grokVideoResolutionOptionsForBackend(backend)).toEqual(["480p", "720p"]);
    expect(grokVideoRatioOptionsForBackend(backend)).toEqual(["2:3", "16:9"]);
    expect(happyHorseResolutionOptionsForBackend(null)).toEqual(["720p", "1080p"]);
    expect(grokVideoRatioOptionsForBackend(null)).toEqual([
      "16:9",
      "9:16",
      "1:1",
      "2:3",
      "3:2",
    ]);
  });

  it("normalizes duration bounds and values", () => {
    expect(seedance2DurationBoundsForBackend({ min_duration: 4.4, max_duration: 12.2 })).toEqual({
      min: 4,
      max: 12,
    });
    expect(seedance2DurationBoundsForBackend({ min_duration: 8, max_duration: 4 })).toEqual({
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
    const normalized = normalizeSeedance2DraftForBackend(
      draft,
      ["480p", "720p"],
      "newapi_seedance-2.0-fast-value",
      true,
    );

    expect(normalized).toMatchObject({ resolution: "720p", scene_optimize: "realistic" });
    const stable = { ...normalized, scene_optimize: "" as const };
    expect(
      normalizeSeedance2DraftForBackend(stable, ["480p", "720p"], "seedance", false),
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
      normalizeHappyHorseDraftForBackend(draft, ["720p", "1080p"], ["16:9", "9:16"]),
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
      normalizeGrokVideoDraftForBackend(draft, ["720p", "480p"], ["16:9", "3:2"]),
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

  it("serializes prompts and provider-specific constraints without losing raw fields", () => {
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
