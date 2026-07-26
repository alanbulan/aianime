// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIDEO_DURATION_SEC,
  clampVideoDuration,
  defaultSceneOptimizeForModel,
  isHappyHorseVideoModel,
  isSeedance20VideoModel,
  isVideoModeSupportedByModel,
  normalizeSceneOptimize,
  normalizeVideoQuality,
  qualityToResolution,
  sceneOptimizeOptionsForModel,
  videoDurationBoundsForModel,
  videoModelReferenceDisabledReason,
  videoQualityOptionsForModel,
} from "./videoGenerationModel";

describe("videoGenerationModel", () => {
  it("normalizes model quality options and request resolution", () => {
    expect(qualityToResolution("1080P")).toBe("1080p");
    expect(
      videoQualityOptionsForModel({
        resolutionOptions: ["1080p", "unknown", " 480P "],
      }),
    ).toEqual(["1080P", "480P"]);
    expect(videoQualityOptionsForModel(null)).toEqual([
      "480P",
      "720P",
      "1080P",
    ]);
    expect(normalizeVideoQuality("1080P", ["720P", "1080P"])).toBe(
      "1080P",
    );
    expect(normalizeVideoQuality("480P", ["720P", "1080P"])).toBe(
      "720P",
    );
    expect(normalizeVideoQuality(undefined, ["1080P"])).toBe("1080P");
  });

  it("resolves duration bounds and clamps rounded values", () => {
    expect(DEFAULT_VIDEO_DURATION_SEC).toBe(5);
    expect(videoDurationBoundsForModel(null)).toEqual({ min: 5, max: 15 });
    expect(
      videoDurationBoundsForModel({ minDuration: 3, maxDuration: 12 }),
    ).toEqual({ min: 3, max: 12 });
    expect(
      videoDurationBoundsForModel({ minDuration: -1, maxDuration: 10 }),
    ).toEqual({ min: 5, max: 10 });
    expect(clampVideoDuration(4.6, { min: 5, max: 12 })).toBe(5);
    expect(clampVideoDuration(9.6, { min: 5, max: 12 })).toBe(10);
    expect(clampVideoDuration(20, { min: 5, max: 12 })).toBe(12);
  });

  it("recognizes HappyHorse and projects its supported modes", () => {
    expect(isHappyHorseVideoModel("Happy_Horse-1.0")).toBe(true);
    expect(isHappyHorseVideoModel("seedance-2.0")).toBe(false);
    expect(isVideoModeSupportedByModel("videoEdit", "happyhorse-1.0")).toBe(
      true,
    );
    expect(
      isVideoModeSupportedByModel("firstLastFrame", "happyhorse-1.0"),
    ).toBe(false);
    expect(isVideoModeSupportedByModel("videoEdit", "seedance-2.0")).toBe(
      false,
    );
    expect(
      isVideoModeSupportedByModel("firstLastFrame", "seedance-2.0"),
    ).toBe(true);
  });

  it("recognizes Seedance 2.0 model id variants", () => {
    expect(isSeedance20VideoModel("huimeng_seedance20_fast")).toBe(true);
    expect(isSeedance20VideoModel("newapi-seedance-2.0-value")).toBe(true);
    expect(isSeedance20VideoModel("seedance_2_0")).toBe(true);
    expect(isSeedance20VideoModel("seedance-1.5-pro")).toBe(false);
    expect(isSeedance20VideoModel(undefined)).toBe(false);
  });

  it("reports model-specific reference restrictions", () => {
    expect(
      videoModelReferenceDisabledReason("grok_video-channel", {
        images: 1,
        videos: 1,
        audios: 0,
      }),
    ).toBe("Grok Video Channel 仅支持图片素材");
    expect(
      videoModelReferenceDisabledReason("grok-video-channel", {
        images: 9,
        videos: 0,
        audios: 0,
      }),
    ).toBe("Grok Video Channel 最多支持 1 张首帧和 7 张参考图");
    expect(
      videoModelReferenceDisabledReason("seedance-1.5-pro", {
        images: 1,
        videos: 0,
        audios: 0,
      }),
    ).toBe("该模型不支持当前接入的素材");
    expect(
      videoModelReferenceDisabledReason("seedance-2.0", {
        images: 1,
        videos: 1,
        audios: 1,
      }),
    ).toBeNull();
  });

  it("resolves and normalizes scene optimization", () => {
    expect(
      sceneOptimizeOptionsForModel({
        sceneOptimizeOptions: ["realistic"],
      }),
    ).toEqual(["realistic"]);
    expect(
      sceneOptimizeOptionsForModel({
        apiModel: "NEWAPI_SEEDANCE-2.0-FAST-VALUE",
      }),
    ).toEqual(["anime", "realistic"]);
    expect(sceneOptimizeOptionsForModel({ id: "other" })).toEqual([]);
    expect(
      defaultSceneOptimizeForModel({ defaultSceneOptimize: "anime" }),
    ).toBe("anime");
    expect(defaultSceneOptimizeForModel({ id: "seedance-fast-value" })).toBe(
      "realistic",
    );
    expect(defaultSceneOptimizeForModel({ id: "seedance-value" })).toBe(
      "anime",
    );
    expect(normalizeSceneOptimize("anime", ["realistic"], "realistic")).toBe(
      "realistic",
    );
    expect(normalizeSceneOptimize("anime", [], "realistic")).toBeUndefined();
  });
});
