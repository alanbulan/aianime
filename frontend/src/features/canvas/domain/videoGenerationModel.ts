// Copyright (c) 2026 AI anime
import type {
  Seedance2SceneOptimize,
  VideoGenMode,
  VideoGenQuality,
} from "./canvasNodes";

const DEFAULT_QUALITIES: ReadonlyArray<VideoGenQuality> = [
  "480P",
  "720P",
  "1080P",
];
export const DEFAULT_VIDEO_DURATION_SEC = 5;
const DEFAULT_DURATION_MIN = DEFAULT_VIDEO_DURATION_SEC;
const DEFAULT_DURATION_MAX = 15;
const SEEDANCE_2_SCENE_OPTIONS: ReadonlyArray<Seedance2SceneOptimize> = [
  "anime",
  "realistic",
];

export interface VideoDurationBounds {
  min: number;
  max: number;
}

export function qualityToResolution(
  quality: VideoGenQuality,
): Lowercase<VideoGenQuality> {
  return quality.toLowerCase() as Lowercase<VideoGenQuality>;
}

function resolutionToQuality(resolution: string): VideoGenQuality | null {
  const normalized = resolution.trim().toLowerCase();
  if (normalized === "480p") return "480P";
  if (normalized === "720p") return "720P";
  if (normalized === "1080p") return "1080P";
  return null;
}

export function videoQualityOptionsForModel(
  model: { resolutionOptions?: string[] } | null | undefined,
): ReadonlyArray<VideoGenQuality> {
  const options = (model?.resolutionOptions ?? [])
    .map(resolutionToQuality)
    .filter((item): item is VideoGenQuality => item != null);
  return options.length > 0 ? options : DEFAULT_QUALITIES;
}

export function normalizeVideoQuality(
  value: VideoGenQuality | undefined,
  options: ReadonlyArray<VideoGenQuality>,
): VideoGenQuality {
  const fallback = options.includes("720P")
    ? "720P"
    : options[0] ?? "720P";
  return value && options.includes(value) ? value : fallback;
}

export function videoDurationBoundsForModel(
  model:
    | { minDuration?: number | null; maxDuration?: number | null }
    | null
    | undefined,
): VideoDurationBounds {
  const min = Number(model?.minDuration);
  const max = Number(model?.maxDuration);
  const resolvedMin =
    Number.isFinite(min) && min > 0 ? min : DEFAULT_DURATION_MIN;
  const resolvedMax =
    Number.isFinite(max) && max >= resolvedMin
      ? max
      : DEFAULT_DURATION_MAX;
  return { min: resolvedMin, max: resolvedMax };
}

export function clampVideoDuration(
  value: number,
  bounds: VideoDurationBounds,
): number {
  return Math.min(Math.max(Math.round(value), bounds.min), bounds.max);
}

function isSeedance2ValueModel(
  modelId: string | null | undefined,
): boolean {
  const normalized = String(modelId ?? "").trim().toLowerCase();
  return (
    normalized === "newapi_seedance-2.0-value" ||
    normalized === "newapi_seedance-2.0-fast-value" ||
    normalized === "huimeng_seedance-2.0-value" ||
    normalized === "huimeng_seedance-2.0-fast-value"
  );
}

function isSeedance1xModel(modelId: string | null | undefined): boolean {
  const normalized = String(modelId ?? "")
    .replace(/[\s._-]/g, "")
    .toLowerCase();
  return /seedance1\d/.test(normalized);
}

function isGrokVideoChannelModel(
  modelId: string | null | undefined,
): boolean {
  const normalized = String(modelId ?? "")
    .replace(/[\s._-]/g, "")
    .toLowerCase();
  return normalized.includes("grokvideochannel");
}

export function isHappyHorseVideoModel(
  modelId: string | null | undefined,
): boolean {
  const normalized = String(modelId ?? "")
    .replace(/[\s._-]/g, "")
    .toLowerCase();
  return normalized.includes("happyhorse10");
}

export function isSeedance20VideoModel(
  modelId: string | null | undefined,
): boolean {
  const normalized = String(modelId ?? "")
    .replace(/[\s._-]/g, "")
    .toLowerCase();
  return normalized.includes("seedance2");
}

export function isVideoModeSupportedByModel(
  mode: VideoGenMode,
  modelId: string | null | undefined,
): boolean {
  if (isHappyHorseVideoModel(modelId)) {
    return (
      mode === "textToVideo" ||
      mode === "imageToVideo" ||
      mode === "imageReference" ||
      mode === "videoEdit"
    );
  }
  return mode !== "videoEdit";
}

export function videoModelReferenceDisabledReason(
  modelId: string | null | undefined,
  counts: { images: number; videos: number; audios: number },
): string | null {
  if (isGrokVideoChannelModel(modelId)) {
    if (counts.videos > 0 || counts.audios > 0) {
      return "Grok Video Channel 仅支持图片素材";
    }
    if (counts.images > 8) {
      return "Grok Video Channel 最多支持 1 张首帧和 7 张参考图";
    }
    return null;
  }
  if (
    isSeedance1xModel(modelId) &&
    (counts.images > 0 || counts.videos > 0 || counts.audios > 0)
  ) {
    return "该模型不支持当前接入的素材";
  }
  return null;
}

export function sceneOptimizeOptionsForModel(
  model:
    | {
        id?: string;
        apiModel?: string;
        sceneOptimizeOptions?: Array<"anime" | "realistic">;
      }
    | null
    | undefined,
): ReadonlyArray<Seedance2SceneOptimize> {
  if (model?.sceneOptimizeOptions?.length) {
    return model.sceneOptimizeOptions;
  }
  return isSeedance2ValueModel(model?.apiModel ?? model?.id)
    ? SEEDANCE_2_SCENE_OPTIONS
    : [];
}

export function defaultSceneOptimizeForModel(
  model:
    | {
        id?: string;
        apiModel?: string;
        defaultSceneOptimize?: "anime" | "realistic" | null;
      }
    | null
    | undefined,
): Seedance2SceneOptimize {
  if (
    model?.defaultSceneOptimize === "anime" ||
    model?.defaultSceneOptimize === "realistic"
  ) {
    return model.defaultSceneOptimize;
  }
  const modelId = String(model?.apiModel ?? model?.id ?? "").toLowerCase();
  return modelId.includes("fast-value") ? "realistic" : "anime";
}

export function normalizeSceneOptimize(
  value: Seedance2SceneOptimize | undefined,
  options: ReadonlyArray<Seedance2SceneOptimize>,
  fallback: Seedance2SceneOptimize,
): Seedance2SceneOptimize | undefined {
  if (options.length === 0) return undefined;
  return value && options.includes(value) ? value : fallback;
}
