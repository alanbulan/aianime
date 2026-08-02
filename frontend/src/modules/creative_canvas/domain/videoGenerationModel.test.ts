// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIDEO_DURATION_SEC,
  clampVideoDuration,
  defaultSceneOptimizeForModel,
  isVideoModeSupportedByModel,
  normalizeSceneOptimize,
  normalizeVideoQuality,
  qualityToResolution,
  sceneOptimizeOptionsForModel,
  supportedVideoModesForModel,
  videoDurationBoundsForModel,
  videoModelReferenceDisabledReason,
  videoModelUsesTypedReferenceModes,
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

  it("uses explicit catalog capabilities for supported modes", () => {
    const typedModel = {
      supportedModes: [
        "textToVideo",
        "imageToVideo",
        "imageReference",
        "videoEdit",
      ] as const,
    };
    expect(isVideoModeSupportedByModel("videoEdit", typedModel)).toBe(true);
    expect(isVideoModeSupportedByModel("firstLastFrame", typedModel)).toBe(false);
    expect(videoModelUsesTypedReferenceModes(typedModel)).toBe(true);
    expect(isVideoModeSupportedByModel("videoEdit", undefined)).toBe(false);
    expect(supportedVideoModesForModel(undefined)).toContain("allReference");
  });

  it("reports capability-declared reference restrictions", () => {
    expect(
      videoModelReferenceDisabledReason({ supportsReferenceVideos: false }, {
        images: 1,
        videos: 1,
        audios: 0,
      }),
    ).toBe("该模型不支持视频参考素材");
    expect(
      videoModelReferenceDisabledReason({ maxReferenceImages: 8 }, {
        images: 9,
        videos: 0,
        audios: 0,
      }),
    ).toBe("该模型最多支持 8 张参考图片");
    expect(
      videoModelReferenceDisabledReason({ supportsReferenceImages: false }, {
        images: 1,
        videos: 0,
        audios: 0,
      }),
    ).toBe("该模型不支持图片参考素材");
    expect(
      videoModelReferenceDisabledReason({}, {
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
        sceneOptimizeOptions: ["anime", "realistic"],
      }),
    ).toEqual(["anime", "realistic"]);
    expect(sceneOptimizeOptionsForModel({})).toEqual([]);
    expect(
      defaultSceneOptimizeForModel({ defaultSceneOptimize: "anime" }),
    ).toBe("anime");
    expect(defaultSceneOptimizeForModel({ sceneOptimizeOptions: ["realistic"] })).toBe(
      "realistic",
    );
    expect(defaultSceneOptimizeForModel({})).toBe(
      "anime",
    );
    expect(normalizeSceneOptimize("anime", ["realistic"], "realistic")).toBe(
      "realistic",
    );
    expect(normalizeSceneOptimize("anime", [], "realistic")).toBeUndefined();
  });
});
