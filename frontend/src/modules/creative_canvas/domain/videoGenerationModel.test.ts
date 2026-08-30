// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  clampVideoDuration,
  defaultSceneOptimizeForModel,
  isVideoModeSupportedByModel,
  normalizeSceneOptimize,
  normalizeVideoDuration,
  normalizeVideoOutput,
  sceneOptimizeOptionsForModel,
  supportedVideoModesForModel,
  videoAspectRatioForOutput,
  videoDurationDefinitionForModel,
  videoExtraParamDefinitionsForModel,
  videoExtraParamsForModel,
  videoModelReferenceDisabledReason,
  videoOutputDefinitionForModel,
  videoOutputForAspectRatio,
  videoReferenceDurationLimitsForModel,
  videoModelUsesTypedReferenceModes,
  videoSupportsGenerateAudio,
} from "./videoGenerationModel";

describe("videoGenerationModel", () => {
  it("projects H3 output and extra parameters from the catalog schema", () => {
    const model = {
      sizeOptions: ["1344x768", "768x1344", "1024x1024"],
      minDuration: 1,
      maxDuration: 15,
      defaultDuration: 3,
      supportsGenerateAudio: false,
      parameterSchema: {
        type: "object",
        properties: {
          size: {
            type: "string",
            enum: ["1344x768", "768x1344", "1024x1024"],
            default: "1344x768",
          },
          steps: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          seed: { type: "integer", minimum: 0, maximum: 2147483647, default: 42 },
          turbo: { type: "boolean", default: false },
        },
      },
    };

    const output = videoOutputDefinitionForModel(model);
    expect(output).toEqual({
      parameter: "size",
      options: ["1344x768", "768x1344", "1024x1024"],
      defaultValue: "1344x768",
    });
    expect(normalizeVideoOutput("720p", output)).toBe("1344x768");
    expect(videoOutputForAspectRatio(output, "9:16", "1344x768")).toBe(
      "768x1344",
    );
    expect(
      videoAspectRatioForOutput(
        "1024x1024",
        ["16:9", "9:16", "1:1"],
        "16:9",
      ),
    ).toBe("1:1");
    expect(videoExtraParamDefinitionsForModel(model).map(({ key }) => key)).toEqual([
      "steps",
      "seed",
      "turbo",
    ]);
    expect(videoExtraParamsForModel(model, { steps: 24 })).toEqual({
      steps: 24,
      seed: 42,
      turbo: false,
    });
    expect(videoDurationDefinitionForModel(model)).toEqual({
      min: 1,
      max: 15,
      defaultValue: 3,
      options: [],
    });
    expect(videoSupportsGenerateAudio(model)).toBe(false);
    expect(videoOutputDefinitionForModel({})).toBeNull();
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
    expect(videoDurationDefinitionForModel(null)).toBeNull();
    expect(
      videoDurationDefinitionForModel({
        minDuration: 3,
        maxDuration: 12,
        defaultDuration: 6,
      }),
    ).toEqual({ min: 3, max: 12, defaultValue: 6, options: [] });
    const enumerated = videoDurationDefinitionForModel({
      minDuration: 6,
      maxDuration: 10,
      defaultDuration: 6,
      durationOptions: [6, 10],
    });
    expect(enumerated).toEqual({
      min: 6,
      max: 10,
      defaultValue: 6,
      options: [6, 10],
    });
    expect(enumerated && normalizeVideoDuration(8, enumerated)).toBe(6);
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
    expect(supportedVideoModesForModel(undefined)).toEqual([]);
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
        sceneOptimizeOptions: ["cinematic"],
      }),
    ).toEqual(["cinematic"]);
    expect(
      sceneOptimizeOptionsForModel({
        sceneOptimizeOptions: ["cinematic", "realistic"],
      }),
    ).toEqual(["cinematic", "realistic"]);
    expect(sceneOptimizeOptionsForModel({})).toEqual([]);
    expect(
      defaultSceneOptimizeForModel({
        sceneOptimizeOptions: ["cinematic", "realistic"],
        defaultSceneOptimize: "cinematic",
      }),
    ).toBe("cinematic");
    expect(defaultSceneOptimizeForModel({ sceneOptimizeOptions: ["realistic"] })).toBe(
      "realistic",
    );
    expect(defaultSceneOptimizeForModel({})).toBeUndefined();
    expect(normalizeSceneOptimize("cinematic", ["realistic"], "realistic")).toBe(
      "realistic",
    );
    expect(normalizeSceneOptimize("cinematic", [], "realistic")).toBeUndefined();
  });
});
