// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { resolveVideoGenerationModeOptions } from "./videoGenerationModeOptions";

function reasonsByMode(
  options: ReturnType<typeof resolveVideoGenerationModeOptions>,
) {
  return Object.fromEntries(
    options.map((option) => [option.key, option.disabledReason]),
  );
}

describe("resolveVideoGenerationModeOptions", () => {
  it("exposes catalog-supported general modes when there are no references", () => {
    const options = resolveVideoGenerationModeOptions({
      supportedModes: ["textToVideo", "allReference", "firstFrame", "imageToVideo", "firstLastFrame", "imageReference"],
      usesTypedReferenceModes: false,
      upstreamCounts: { images: 0, videos: 0, audios: 0 },
    });

    expect(options.map((option) => option.key)).toEqual([
      "textToVideo",
      "allReference",
      "firstFrame",
      "imageToVideo",
      "firstLastFrame",
      "imageReference",
    ]);
    expect(options.every((option) => option.disabledReason === null)).toBe(true);
  });

  it("restricts general references without hiding supported modes", () => {
    const videoOptions = resolveVideoGenerationModeOptions({
      supportedModes: ["textToVideo", "allReference", "firstFrame", "imageToVideo", "firstLastFrame", "imageReference"],
      usesTypedReferenceModes: false,
      upstreamCounts: { images: 0, videos: 1, audios: 0 },
    });
    const videoReasons = reasonsByMode(videoOptions);
    expect(videoReasons.allReference).toBeNull();
    expect(videoReasons.textToVideo).toBe("上游含视频素材时只能用「全能参考」");
    expect(videoReasons.imageReference).toBe(
      "上游含视频素材时只能用「全能参考」",
    );

    const imageOptions = resolveVideoGenerationModeOptions({
      supportedModes: ["textToVideo", "allReference", "firstFrame", "imageToVideo", "firstLastFrame", "imageReference"],
      usesTypedReferenceModes: false,
      upstreamCounts: { images: 3, videos: 0, audios: 1 },
    });
    const imageReasons = reasonsByMode(imageOptions);
    expect(imageReasons.textToVideo).toBe("已引用图片/音频素材时不可用");
    expect(imageReasons.firstLastFrame).toBe("上游图片超过 2 张时不可用");
  });

  it("keeps typed-reference first-frame and image-reference modes distinct", () => {
    const options = resolveVideoGenerationModeOptions({
      supportedModes: ["textToVideo", "firstFrame", "imageToVideo", "imageReference", "videoEdit"],
      usesTypedReferenceModes: true,
      upstreamCounts: { images: 1, videos: 0, audios: 0 },
    });
    const reasons = reasonsByMode(options);

    expect(options.map((option) => option.key)).toEqual([
      "textToVideo",
      "firstFrame",
      "imageToVideo",
      "imageReference",
      "videoEdit",
    ]);
    expect(options.find((option) => option.key === "firstFrame")?.labelKey).toBe(
      "node.videoNode.tabs.firstFrame",
    );
    expect(options.find((option) => option.key === "imageToVideo")?.labelKey).toBe(
      "node.videoNode.tabs.imageToVideo",
    );
    expect(reasons.textToVideo).toBe(
      "已连接图片节点，请选择「首帧」或「图片参考」",
    );
    expect(reasons.firstFrame).toBeNull();
    expect(reasons.imageToVideo).toBeNull();
    expect(reasons.imageReference).toBeNull();
    expect(reasons.videoEdit).toBe("需要连接视频节点（1个）");
  });

  it("reduces typed video references to text and edit modes", () => {
    const oneVideo = resolveVideoGenerationModeOptions({
      supportedModes: ["textToVideo", "imageToVideo", "imageReference", "videoEdit"],
      usesTypedReferenceModes: true,
      upstreamCounts: { images: 0, videos: 1, audios: 0 },
    });
    expect(oneVideo.map((option) => option.key)).toEqual([
      "textToVideo",
      "videoEdit",
    ]);
    expect(reasonsByMode(oneVideo)).toEqual({
      textToVideo: "已连接视频节点，请使用「视频编辑」",
      videoEdit: null,
    });

    const twoVideos = resolveVideoGenerationModeOptions({
      supportedModes: ["textToVideo", "imageToVideo", "imageReference", "videoEdit"],
      usesTypedReferenceModes: true,
      upstreamCounts: { images: 0, videos: 2, audios: 0 },
    });
    expect(reasonsByMode(twoVideos).videoEdit).toBe(
      "「视频编辑」仅支持连接 1 个视频节点",
    );
  });
});
