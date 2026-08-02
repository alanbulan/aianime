// Copyright (c) 2026 AI anime
import type {
  Seedance2SceneOptimize,
  VideoGenQuality,
} from "./canvasNodes";
import type { VideoGenMode } from "@/modules/creative_canvas/public";

const DEFAULT_QUALITIES: ReadonlyArray<VideoGenQuality> = [
  "480P",
  "720P",
  "1080P",
];
export const DEFAULT_VIDEO_DURATION_SEC = 5;
const DEFAULT_DURATION_MIN = DEFAULT_VIDEO_DURATION_SEC;
const DEFAULT_DURATION_MAX = 15;
const DEFAULT_SUPPORTED_MODES: ReadonlyArray<VideoGenMode> = [
  "textToVideo",
  "allReference",
  "imageToVideo",
  "firstLastFrame",
  "imageReference",
];

export interface VideoModelCapabilityDescriptor {
  readonly supportedModes?: ReadonlyArray<VideoGenMode>;
  readonly supportsHumanReview?: boolean;
  readonly supportsReferenceImages?: boolean;
  readonly supportsReferenceVideos?: boolean;
  readonly supportsReferenceAudios?: boolean;
  readonly maxReferenceImages?: number | null;
  readonly maxReferenceVideos?: number | null;
  readonly maxReferenceAudios?: number | null;
  readonly maxReferenceTotal?: number | null;
  readonly maxReferenceAudioDurationSeconds?: number | null;
  readonly sceneOptimizeOptions?: Array<"anime" | "realistic">;
  readonly defaultSceneOptimize?: "anime" | "realistic" | null;
}

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

export function isVideoModeSupportedByModel(
  mode: VideoGenMode,
  model: VideoModelCapabilityDescriptor | null | undefined,
): boolean {
  return (model?.supportedModes ?? DEFAULT_SUPPORTED_MODES).includes(mode);
}

export function supportedVideoModesForModel(
  model: VideoModelCapabilityDescriptor | null | undefined,
): ReadonlyArray<VideoGenMode> {
  return model?.supportedModes?.length
    ? model.supportedModes
    : DEFAULT_SUPPORTED_MODES;
}

export function videoModelUsesTypedReferenceModes(
  model: VideoModelCapabilityDescriptor | null | undefined,
): boolean {
  return (
    isVideoModeSupportedByModel("videoEdit", model) &&
    !isVideoModeSupportedByModel("allReference", model)
  );
}

export function videoModelReferenceDisabledReason(
  model: VideoModelCapabilityDescriptor | null | undefined,
  counts: { images: number; videos: number; audios: number },
): string | null {
  if (model?.supportsReferenceImages === false && counts.images > 0) {
    return "该模型不支持图片参考素材";
  }
  if (model?.supportsReferenceVideos === false && counts.videos > 0) {
    return "该模型不支持视频参考素材";
  }
  if (model?.supportsReferenceAudios === false && counts.audios > 0) {
    return "该模型不支持音频参考素材";
  }
  if (exceedsLimit(counts.images, model?.maxReferenceImages)) {
    return `该模型最多支持 ${model?.maxReferenceImages} 张参考图片`;
  }
  if (exceedsLimit(counts.videos, model?.maxReferenceVideos)) {
    return `该模型最多支持 ${model?.maxReferenceVideos} 个参考视频`;
  }
  if (exceedsLimit(counts.audios, model?.maxReferenceAudios)) {
    return `该模型最多支持 ${model?.maxReferenceAudios} 个参考音频`;
  }
  const total = counts.images + counts.videos + counts.audios;
  if (exceedsLimit(total, model?.maxReferenceTotal)) {
    return `该模型最多支持 ${model?.maxReferenceTotal} 个参考素材`;
  }
  return null;
}

function exceedsLimit(value: number, limit: number | null | undefined): boolean {
  return typeof limit === "number" && Number.isFinite(limit) && value > limit;
}

export function sceneOptimizeOptionsForModel(
  model: VideoModelCapabilityDescriptor | null | undefined,
): ReadonlyArray<Seedance2SceneOptimize> {
  if (model?.sceneOptimizeOptions?.length) {
    return model.sceneOptimizeOptions;
  }
  return [];
}

export function defaultSceneOptimizeForModel(
  model: VideoModelCapabilityDescriptor | null | undefined,
): Seedance2SceneOptimize {
  if (
    model?.defaultSceneOptimize === "anime" ||
    model?.defaultSceneOptimize === "realistic"
  ) {
    return model.defaultSceneOptimize;
  }
  return model?.sceneOptimizeOptions?.[0] ?? "anime";
}

export function normalizeSceneOptimize(
  value: Seedance2SceneOptimize | undefined,
  options: ReadonlyArray<Seedance2SceneOptimize>,
  fallback: Seedance2SceneOptimize,
): Seedance2SceneOptimize | undefined {
  if (options.length === 0) return undefined;
  return value && options.includes(value) ? value : fallback;
}
