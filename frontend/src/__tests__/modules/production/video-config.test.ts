// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  clampDuration,
  defaultVideoRatioForProjectAspect,
  getBeatVideoConfigSaveKey,
  normalizeAdvancedVideoDraftForModel,
  normalizeReferenceVideoDraftForModel,
  parseBeatVideoConfig,
  referenceVideoRatioOptionsForModel,
  referenceVideoResolutionOptionsForDuration,
  referenceVideoResolutionOptionsForModel,
  sameBeatVideoConfig,
  serializeBeatVideoConfig,
  serializeReferenceVideoConfig,
  videoDurationBoundsForModel,
  videoDurationOptionsForModel,
  videoModeOptionsForModel,
  videoModelDisplayLabel,
  videoRatioOptionsForModel,
  videoResolutionOptionsForModel,
} from "@/modules/production/public";

describe("production video config domain", () => {
  it("parses only the canonical schema and rejects plain legacy text", () => {
    const draft = parseBeatVideoConfig(
      JSON.stringify({
        obsolete_field: "drop",
        mode: "first_frame",
        duration: "6.6",
        resolution: "1080p",
        ratio: "16:9",
        prompt_validation_source: "source",
      }),
    );

    expect(draft).toMatchObject({
      mode: "first_frame",
      duration: 7,
      resolution: "1080p",
      ratio: "16:9",
      managed: { prompt_validation_source: "source" },
    });
    expect(serializeBeatVideoConfig(draft, draft)).not.toHaveProperty(
      "obsolete_field",
    );
    expect(parseBeatVideoConfig("old prompt").final_prompt).toBe("");
  });

  it("derives model options only from declared capabilities", () => {
    const capabilities = {
      resolutionOptions: ["1080P", "768P", "720p", "1080p", "unsupported"],
      ratioOptions: ["adaptive", "2:3", "16:9", "2:3"],
      supportedModes: ["textToVideo", "firstLastFrame", "IMAGE_REFERENCE"],
    };

    expect(videoResolutionOptionsForModel("video-model-a", capabilities)).toEqual([
      "1080p",
      "768p",
      "720p",
    ]);
    expect(videoModeOptionsForModel(capabilities)).toEqual([
      "text_to_video",
      "first_last_frame",
      "multimodal_reference",
    ]);
    expect(videoRatioOptionsForModel(capabilities)).toEqual(["2:3", "16:9"]);
    expect(defaultVideoRatioForProjectAspect("2:3")).toBe("9:16");
    expect(videoModelDisplayLabel("unknown", new Map())).toBe("unknown");
    expect(
      videoModelDisplayLabel("known", new Map([["known", "已配置模型"]])),
    ).toBe("已配置模型");
  });

  it("normalizes duration bounds and values", () => {
    expect(videoDurationBoundsForModel({ minDuration: 4.4, maxDuration: 12.2 })).toEqual({
      min: 5,
      max: 12,
    });
    expect(clampDuration("12.7", { min: 4, max: 12 })).toBe(12);
    expect(clampDuration("invalid", { min: 8, max: 12 })).toBe(8);
    expect(
      videoDurationOptionsForModel({ durationOptions: [12, 4, 8, 8] }),
    ).toEqual([4, 8, 12]);
    expect(clampDuration(7, { min: 4, max: 12 }, [4, 8, 12])).toBe(8);
  });

  it("normalizes advanced settings against declared capabilities", () => {
    const draft = parseBeatVideoConfig(
      JSON.stringify({ resolution: "1080p", scene_optimize: "" }),
    );
    const normalized = normalizeAdvancedVideoDraftForModel(
      draft,
      ["480p", "720p"],
      "video-model-a",
      true,
      ["first_frame"],
      ["16:9"],
    );

    expect(normalized).toMatchObject({
      mode: "first_frame",
      ratio: "16:9",
      resolution: "720p",
      scene_optimize: "anime",
    });
  });

  it("normalizes reference settings and duration-specific resolution limits", () => {
    const capabilities = {
      resolutionOptions: ["720p", "1080p"],
      ratioOptions: ["16:9", "9:16"],
    };
    const resolutions = referenceVideoResolutionOptionsForModel(capabilities);
    const ratios = referenceVideoRatioOptionsForModel(capabilities);
    expect(
      referenceVideoResolutionOptionsForDuration(resolutions, 10, {
        "1080p": 8,
      }),
    ).toEqual(["720p"]);

    const normalized = normalizeReferenceVideoDraftForModel(
      parseBeatVideoConfig(
        JSON.stringify({
          duration: 10,
          mode: "first_last_frame",
          ratio: "1:1",
          resolution: "1080p",
          generate_audio: true,
          human_review: true,
        }),
      ),
      resolutions,
      ratios,
      { "1080p": 8 },
    );
    expect(normalized).toMatchObject({
      mode: "multimodal_reference",
      ratio: "16:9",
      resolution: "720p",
      generate_audio: false,
      human_review: false,
    });
  });

  it("serializes canonical fields and preserves only managed backend metadata", () => {
    const previous = parseBeatVideoConfig(
      JSON.stringify({
        prompt_validation_source: "source",
        reference_image_paths: ["a.png"],
        reference_video_paths: ["motion.mp4"],
        final_prompt: "old prompt",
      }),
    );
    const draft = {
      ...previous,
      prompt_guidance: "  guidance  ",
      final_prompt: "new prompt",
    };

    expect(serializeBeatVideoConfig(draft, previous)).toMatchObject({
      prompt_validation_source: "source",
      reference_image_paths: ["a.png"],
      reference_video_paths: ["motion.mp4"],
      prompt_guidance: "guidance",
      final_prompt: "new prompt",
      prompt_source: "manual",
    });
    expect(serializeReferenceVideoConfig(draft, previous)).toMatchObject({
      generate_audio: false,
      human_review: false,
    });
    expect(sameBeatVideoConfig(draft, { ...draft })).toBe(true);
    expect(getBeatVideoConfigSaveKey(3, { mode: "first_frame" })).toBe(
      '3:{"mode":"first_frame"}',
    );
  });
});
