// Copyright (c) 2026 AI anime
import type { VideoGenMode } from "@/features/canvas/domain/canvasNodes";

export interface VideoGenerationModeCounts {
  videos: number;
  images: number;
  audios: number;
}

export interface VideoGenerationModeOption {
  key: VideoGenMode;
  labelKey: string;
  disabledReason: string | null;
}

const MODE_OPTIONS: ReadonlyArray<
  Pick<VideoGenerationModeOption, "key" | "labelKey">
> = [
  { key: "textToVideo", labelKey: "node.videoNode.tabs.textToVideo" },
  { key: "allReference", labelKey: "node.videoNode.tabs.allReference" },
  { key: "imageToVideo", labelKey: "node.videoNode.tabs.imageToVideo" },
  {
    key: "firstLastFrame",
    labelKey: "node.videoNode.tabs.firstLastFrame",
  },
  { key: "imageReference", labelKey: "node.videoNode.tabs.imageReference" },
  { key: "videoEdit", labelKey: "node.videoNode.tabs.videoEdit" },
];

const TYPED_REFERENCE_MODE_ORDER: ReadonlyArray<VideoGenMode> = [
  "textToVideo",
  "imageToVideo",
  "imageReference",
  "videoEdit",
];

function disabledReason(
  mode: VideoGenMode,
  usesTypedReferenceModes: boolean,
  upstreamCounts: VideoGenerationModeCounts,
): string | null {
  if (usesTypedReferenceModes) {
    const { images, videos } = upstreamCounts;
    switch (mode) {
      case "textToVideo":
        if (videos > 0) return "已连接视频节点，请使用「视频编辑」";
        if (images > 0) return "已连接图片节点，请选择「首帧」或「图片参考」";
        return null;
      case "imageToVideo":
        if (videos > 0) return "已连接视频节点，「首帧」不可用";
        if (images === 0) return "需要连接图片节点（1个）";
        if (images > 1) return "「首帧」仅支持单张图片，请用「图片参考」";
        return null;
      case "imageReference":
        if (videos > 0) return "已连接视频节点，「图片参考」不可用";
        if (images === 0) return "需要连接图片节点（1~9个）";
        if (images > 9) return "「图片参考」最多支持 9 张图片";
        return null;
      case "videoEdit":
        if (videos === 0) return "需要连接视频节点（1个）";
        if (videos > 1) return "「视频编辑」仅支持连接 1 个视频节点";
        return null;
      default:
        return "当前模型不支持该模式";
    }
  }
  if (upstreamCounts.videos > 0 && mode !== "allReference") {
    return "上游含视频素材时只能用「全能参考」";
  }
  if (
    mode === "textToVideo" &&
    (upstreamCounts.images > 0 || upstreamCounts.audios > 0)
  ) {
    return "已引用图片/音频素材时不可用";
  }
  if (mode === "imageToVideo" && upstreamCounts.videos >= 2) {
    return "上游有多个视频时不可用";
  }
  if (mode === "firstLastFrame" && upstreamCounts.images > 2) {
    return "上游图片超过 2 张时不可用";
  }
  return null;
}

export function resolveVideoGenerationModeOptions({
  supportedModes,
  usesTypedReferenceModes,
  upstreamCounts,
}: {
  supportedModes: ReadonlyArray<VideoGenMode>;
  usesTypedReferenceModes: boolean;
  upstreamCounts: VideoGenerationModeCounts;
}): VideoGenerationModeOption[] {
  const visibleOptions = usesTypedReferenceModes
    ? (upstreamCounts.videos > 0
        ? (["textToVideo", "videoEdit"] as VideoGenMode[])
        : TYPED_REFERENCE_MODE_ORDER
      )
        .filter((key) => supportedModes.includes(key))
        .map((key) => MODE_OPTIONS.find((option) => option.key === key))
        .filter(
          (
            option,
          ): option is Pick<
            VideoGenerationModeOption,
            "key" | "labelKey"
          > => option != null,
        )
        .map((option) =>
          option.key === "imageToVideo"
            ? { ...option, labelKey: "node.videoNode.tabs.firstFrame" }
            : option,
        )
    : MODE_OPTIONS.filter((option) => supportedModes.includes(option.key));

  return visibleOptions.map((option) => ({
    ...option,
    disabledReason: disabledReason(
      option.key,
      usesTypedReferenceModes,
      upstreamCounts,
    ),
  }));
}
