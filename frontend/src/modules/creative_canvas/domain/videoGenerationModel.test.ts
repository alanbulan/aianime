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
  videoReferenceDurationLimitsForModel,
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

  it("normalizes independent audio and video duration capabilities", () => {
    const model = {
      referenceAudioMinSeconds: 1.8,
      referenceAudioMaxSeconds: 15.2,
      referenceAudioTotalMinSeconds: 2,
      referenceAudioTotalMaxSeconds: 15.2,
      referenceVideoMinSeconds: 3,
      referenceVideoMaxSeconds: 12.5,
      referenceVideoTotalMinSeconds: 5,
      referenceVideoTotalMaxSeconds: 30,
    };

    expect(videoReferenceDurationLimitsForModel(model, "audio")).toEqual({
      minMs: 1_800,
      maxMs: 15_200,
      totalMinMs: 2_000,
      totalMaxMs: 15_200,
    });
    expect(videoReferenceDurationLimitsForModel(model, "video")).toEqual({
      minMs: 3_000,
      maxMs: 12_500,
      totalMinMs: 5_000,
      totalMaxMs: 30_000,
    });
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

  it("treats supported modes as authoritative for reference media", () => {
    const imageOnly = {
      supportedModes: [
        "textToVideo",
        "imageToVideo",
        "imageReference",
      ] as const,
    };
    expect(
      videoModelReferenceDisabledReason(imageOnly, {
        images: 1,
        videos: 1,
        audios: 0,
      }),
    ).toBe("该模型不支持视频参考素材");
    expect(
      videoModelReferenceDisabledReason(
        { supportedModes: [...imageOnly.supportedModes, "videoEdit"] },
        { images: 1, videos: 1, audios: 0 },
      ),
    ).toBeNull();
    expect(
      videoModelReferenceDisabledReason(
        { supportedModes: ["textToVideo", "imageToVideo"] },
        { images: 2, videos: 0, audios: 0 },
      ),
    ).toBe("该模型单次仅支持 1 张参考图片");
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
