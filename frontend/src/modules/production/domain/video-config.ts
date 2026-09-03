// Copyright (c) 2026 AI anime
import type { VideoModelOption } from "@/modules/production/domain/video-model";

const DEFAULT_ADVANCED_VIDEO_MODE_OPTIONS = [
  "first_frame",
  "first_last_frame",
  "multimodal_reference",
] as const;
const DEFAULT_ADVANCED_VIDEO_RATIO_OPTIONS = [
  "9:16",
  "16:9",
  "1:1",
  "4:3",
  "3:4",
  "21:9",
] as const;
const DEFAULT_REFERENCE_VIDEO_RESOLUTION_OPTIONS = ["720p"] as const;
const DEFAULT_REFERENCE_VIDEO_RATIO_OPTIONS = ["16:9"] as const;

export type VideoResolutionTier = "480p" | "720p" | "768p" | "1080p";
export type ExactVideoResolution = `${number}x${number}`;
export type VideoResolution = VideoResolutionTier | ExactVideoResolution;
export type VideoReferenceMode =
  | "text_to_video"
  | "first_frame"
  | "first_last_frame"
  | "multimodal_reference";
export type VideoAspectRatio =
  | "9:16"
  | "16:9"
  | "1:1"
  | "4:3"
  | "3:4"
  | "21:9"
  | "2:3"
  | "3:2";

export interface VideoDurationBounds {
  min: number;
  max: number;
}

export interface BeatVideoConfigDraft {
  managed: {
    prompt_validation_source: string;
    prompt_inputs_hash: string;
    prompt_updated_at: string;
    reference_image_paths: string[];
    reference_video_paths: string[];
    reference_audio_paths: string[];
    selected_asset_keys: string[];
  };
  mode: VideoReferenceMode;
  duration: number;
  resolution: VideoResolution;
  ratio: VideoAspectRatio;
  generate_audio: boolean;
  return_last_frame: boolean;
  scene_optimize: "" | "anime" | "realistic";
  human_review: boolean;
  prompt_source: string;
  prompt_guidance: string;
  final_prompt: string;
  text_overlay: {
    enabled: boolean;
    kind: string;
    content: string;
    placement: string;
    timing: string;
    style: string;
    speaker: string;
  };
}

export type VideoModelConfigCapabilities = Pick<
  VideoModelOption,
  | "resolutionOptions"
  | "ratioOptions"
  | "supportedModes"
  | "minDuration"
  | "maxDuration"
  | "durationOptions"
  | "resolutionMaxSeconds"
  | "sceneOptimizeOptions"
>;

export function parseBeatVideoConfig(
  value: string | null | undefined,
  defaultRatio: VideoAspectRatio = "9:16",
): BeatVideoConfigDraft {
  const text = String(value ?? "").trim();
  if (!text) return defaultBeatVideoConfig({}, defaultRatio);
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return defaultBeatVideoConfig(parsed as Record<string, unknown>, defaultRatio);
    }
  } catch {}
  return defaultBeatVideoConfig({}, defaultRatio);
}

export function defaultVideoRatioForProjectAspect(
  aspect: "2:3" | "16:9",
): VideoAspectRatio {
  return aspect === "16:9" ? "16:9" : "9:16";
}

export function normalizeVideoReferenceMode(value: unknown): VideoReferenceMode {
  if (
    value === "text_to_video" ||
    value === "first_frame" ||
    value === "first_last_frame" ||
    value === "multimodal_reference"
  ) {
    return value;
  }
  return "multimodal_reference";
}

export function videoModelDisplayLabel(
  value: string | null | undefined,
  labels: ReadonlyMap<string, string>,
): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const exact = labels.get(text);
  if (exact) return exact;
  return text;
}

export function videoResolutionOptionsForModel(
  _value: string | null | undefined,
  capabilities?: VideoModelConfigCapabilities | null,
): readonly VideoResolution[] {
  const declaredOptions = Array.from(
    new Set(
      (capabilities?.resolutionOptions ?? [])
        .map(normalizedVideoResolution)
        .filter((option): option is VideoResolution => option !== null),
    ),
  );
  return declaredOptions;
}

function normalizedVideoResolution(value: unknown): VideoResolution | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "480p" ||
    normalized === "720p" ||
    normalized === "768p" ||
    normalized === "1080p"
  ) {
    return normalized;
  }
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(normalized);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 64 || width > 8192 || height < 64 || height > 8192) return null;
  return `${width}x${height}` as ExactVideoResolution;
}

function videoModeFromCapability(value: string): VideoReferenceMode | null {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (["first_frame", "image_to_video", "i2v"].includes(normalized)) {
    return "first_frame";
  }
  if (["text_to_video", "t2v"].includes(normalized)) {
    return "text_to_video";
  }
  if (["first_last_frame", "keyframe", "flf"].includes(normalized)) {
    return "first_last_frame";
  }
  if (
    [
      "multimodal_reference",
      "all_reference",
      "reference_to_video",
      "image_reference",
      "r2v",
    ].includes(normalized)
  ) {
    return "multimodal_reference";
  }
  return null;
}

export function videoModeOptionsForModel(
  capabilities?: VideoModelConfigCapabilities | null,
): readonly VideoReferenceMode[] {
  const declared = capabilities?.supportedModes;
  if (!declared?.length) return DEFAULT_ADVANCED_VIDEO_MODE_OPTIONS;
  const options = Array.from(
    new Set(
      declared
        .map(videoModeFromCapability)
        .filter((mode): mode is VideoReferenceMode => mode !== null),
    ),
  );
  return options.length ? options : DEFAULT_ADVANCED_VIDEO_MODE_OPTIONS;
}

export function videoRatioOptionsForModel(
  capabilities?: VideoModelConfigCapabilities | null,
): readonly VideoAspectRatio[] {
  const options = capabilities?.ratioOptions?.filter(
    (ratio): ratio is VideoAspectRatio =>
      ratio === "9:16" ||
      ratio === "16:9" ||
      ratio === "1:1" ||
      ratio === "4:3" ||
      ratio === "3:4" ||
      ratio === "21:9" ||
      ratio === "2:3" ||
      ratio === "3:2",
  );
  return options?.length
    ? Array.from(new Set(options))
    : DEFAULT_ADVANCED_VIDEO_RATIO_OPTIONS;
}

export function normalizeAdvancedVideoDraftForModel(
  draft: BeatVideoConfigDraft,
  resolutionOptions: readonly VideoResolution[],
  _model: string | null | undefined,
  isValueStyle: boolean,
  modeOptions: readonly VideoReferenceMode[] = DEFAULT_ADVANCED_VIDEO_MODE_OPTIONS,
  ratioOptions: readonly VideoAspectRatio[] = DEFAULT_ADVANCED_VIDEO_RATIO_OPTIONS,
  durationBounds: VideoDurationBounds = { min: 1, max: 15 },
  durationOptions: readonly number[] = [],
): BeatVideoConfigDraft {
  const fallbackResolution = resolutionOptions.includes("720p")
    ? "720p"
    : resolutionOptions[0];
  const resolution = resolutionOptions.length === 0
    ? draft.resolution
    : resolutionOptions.includes(draft.resolution)
      ? draft.resolution
      : fallbackResolution!;
  const mode = modeOptions.includes(draft.mode)
    ? draft.mode
    : modeOptions[0] || "first_frame";
  const ratio = ratioOptions.includes(draft.ratio)
    ? draft.ratio
    : ratioOptions[0] || "16:9";
  const sceneOptimize = isValueStyle
    ? draft.scene_optimize || "anime"
    : "";
  const duration = clampDuration(
    draft.duration,
    durationBounds,
    durationOptions,
  );
  if (
    draft.resolution === resolution &&
    draft.mode === mode &&
    draft.ratio === ratio &&
    draft.duration === duration &&
    draft.scene_optimize === sceneOptimize
  ) {
    return draft;
  }
  return {
    ...draft,
    mode,
    duration,
    ratio,
    resolution,
    scene_optimize: sceneOptimize,
  };
}

export function referenceVideoResolutionOptionsForModel(
  model: VideoModelConfigCapabilities | null | undefined,
): readonly VideoResolution[] {
  const options = model?.resolutionOptions
    ?.map(normalizedVideoResolution)
    .filter(
      (value): value is VideoResolution => value !== null,
    );
  return options?.length ? options : DEFAULT_REFERENCE_VIDEO_RESOLUTION_OPTIONS;
}

export function referenceVideoResolutionOptionsForDuration(
  options: readonly VideoResolution[],
  duration: number,
  resolutionMaxSeconds: Readonly<Record<string, number>> = {},
): readonly VideoResolution[] {
  const targetDuration = Number(duration);
  if (!Number.isFinite(targetDuration) || targetDuration <= 0) return options;
  const supported = options.filter((resolution) => {
    const maximum = Number(resolutionMaxSeconds[resolution]);
    return !Number.isFinite(maximum) || maximum <= 0 || targetDuration <= maximum;
  });
  return supported.length ? supported : options;
}

export function referenceVideoRatioOptionsForModel(
  model: VideoModelConfigCapabilities | null | undefined,
): readonly VideoAspectRatio[] {
  const options = model?.ratioOptions?.filter(
    (value): value is VideoAspectRatio =>
      /^\d{1,4}:\d{1,4}$/.test(value) &&
      value.split(":").every((part) => Number(part) > 0),
  );
  return options?.length ? options : DEFAULT_REFERENCE_VIDEO_RATIO_OPTIONS;
}

export function normalizeReferenceVideoMode(value: unknown): VideoReferenceMode {
  return value === "first_frame" ? "first_frame" : "multimodal_reference";
}

export function normalizeReferenceVideoRatio(
  value: unknown,
  options: readonly VideoAspectRatio[],
  fallback: VideoAspectRatio = "16:9",
): VideoAspectRatio {
  return options.includes(value as VideoAspectRatio)
    ? (value as VideoAspectRatio)
    : options[0] || fallback;
}

export function normalizeReferenceVideoDraftForModel(
  draft: BeatVideoConfigDraft,
  resolutionOptions: readonly VideoResolution[],
  ratioOptions: readonly VideoAspectRatio[],
  resolutionMaxSeconds: Readonly<Record<string, number>> = {},
  durationBounds: VideoDurationBounds = { min: 1, max: 15 },
  durationOptions: readonly number[] = [],
): BeatVideoConfigDraft {
  const duration = clampDuration(
    draft.duration,
    durationBounds,
    durationOptions,
  );
  const durationResolutionOptions = referenceVideoResolutionOptionsForDuration(
    resolutionOptions,
    duration,
    resolutionMaxSeconds,
  );
  const fallbackResolution = durationResolutionOptions[0] || "720p";
  const resolution: VideoResolution = durationResolutionOptions.includes(
    draft.resolution,
  )
    ? draft.resolution
    : fallbackResolution;
  const ratio = normalizeReferenceVideoRatio(draft.ratio, ratioOptions);
  const mode = normalizeReferenceVideoMode(draft.mode);
  if (
    draft.mode === mode &&
    draft.duration === duration &&
    draft.resolution === resolution &&
    draft.ratio === ratio &&
    draft.generate_audio === false &&
    draft.return_last_frame === false &&
    draft.scene_optimize === "" &&
    draft.human_review === false
  ) {
    return draft;
  }
  return {
    ...draft,
    mode,
    duration,
    resolution,
    ratio,
    generate_audio: false,
    return_last_frame: false,
    scene_optimize: "",
    human_review: false,
  };
}

export function videoDurationBoundsForModel(
  model: VideoModelConfigCapabilities | null | undefined,
): VideoDurationBounds {
  const options = normalizedVideoDurationOptions(model?.durationOptions);
  const min = Number(model?.minDuration);
  const max = Number(model?.maxDuration);
  const safeMin = Number.isFinite(min) && min > 0
    ? Math.ceil(min)
    : options[0] ?? 1;
  const safeMax = Number.isFinite(max) && Math.floor(max) >= safeMin
    ? Math.floor(max)
    : options[options.length - 1] ?? Math.max(safeMin, 15);
  return { min: safeMin, max: safeMax };
}

export function videoDurationOptionsForModel(
  model: VideoModelConfigCapabilities | null | undefined,
): readonly number[] {
  const bounds = videoDurationBoundsForModel(model);
  return normalizedVideoDurationOptions(model?.durationOptions).filter(
    (option) => option >= bounds.min && option <= bounds.max,
  );
}

export function normalizeVideoResolutionTier(
  value: unknown,
  fallback: VideoResolutionTier = "720p",
): VideoResolutionTier {
  if (
    value === "480p" ||
    value === "720p" ||
    value === "768p" ||
    value === "1080p"
  ) {
    return value;
  }
  return fallback;
}

export function normalizeVideoResolution(
  value: unknown,
  fallback: VideoResolution = "720p",
): VideoResolution {
  return normalizedVideoResolution(value) ?? fallback;
}

export function normalizeVideoAspectRatio(
  value: unknown,
  fallback: VideoAspectRatio = "9:16",
): VideoAspectRatio {
  if (
    value === "9:16" ||
    value === "16:9" ||
    value === "1:1" ||
    value === "4:3" ||
    value === "3:4" ||
    value === "21:9" ||
    value === "2:3" ||
    value === "3:2"
  ) {
    return value;
  }
  return fallback;
}

export function clampDuration(
  value: unknown,
  bounds: VideoDurationBounds = { min: 1, max: 15 },
  options: readonly number[] = [],
): number {
  const parsed = Number(value);
  const requested = Number.isFinite(parsed) ? Math.round(parsed) : 5;
  const bounded = Math.max(bounds.min, Math.min(bounds.max, requested));
  const supported = normalizedVideoDurationOptions(options).filter(
    (option) => option >= bounds.min && option <= bounds.max,
  );
  return (
    supported.find((option) => option >= bounded) ??
    supported[supported.length - 1] ??
    bounded
  );
}

function normalizedVideoDurationOptions(
  values: readonly number[] | null | undefined,
): number[] {
  return Array.from(
    new Set(
      (values ?? []).filter(
        (value) => Number.isFinite(value) && Number.isInteger(value) && value > 0,
      ),
    ),
  ).sort((left, right) => left - right);
}

export function sameBeatVideoConfig(
  left: BeatVideoConfigDraft,
  right: BeatVideoConfigDraft,
): boolean {
  return (
    left.mode === right.mode &&
    left.duration === right.duration &&
    left.resolution === right.resolution &&
    left.ratio === right.ratio &&
    left.generate_audio === right.generate_audio &&
    left.return_last_frame === right.return_last_frame &&
    left.scene_optimize === right.scene_optimize &&
    left.human_review === right.human_review &&
    left.prompt_guidance === right.prompt_guidance &&
    left.final_prompt === right.final_prompt &&
    JSON.stringify(left.text_overlay) === JSON.stringify(right.text_overlay)
  );
}

export function serializeBeatVideoConfig(
  draft: BeatVideoConfigDraft,
  previous: BeatVideoConfigDraft,
): Record<string, unknown> {
  // Keep final_prompt verbatim so an inserted mention's separator space survives autosave.
  const finalPrompt = draft.final_prompt;
  const trimmedFinalPrompt = finalPrompt.trim();
  return {
    ...draft.managed,
    mode: draft.mode,
    duration: draft.duration,
    resolution: draft.resolution,
    ratio: draft.ratio,
    generate_audio: true,
    return_last_frame: draft.return_last_frame,
    scene_optimize: draft.scene_optimize,
    human_review: draft.human_review,
    prompt_guidance: draft.prompt_guidance.trim(),
    final_prompt: finalPrompt,
    text_overlay: {
      ...draft.text_overlay,
      enabled: false,
      content: draft.text_overlay.content.trim(),
      style: draft.text_overlay.style.trim(),
      speaker: draft.text_overlay.speaker.trim(),
    },
    prompt_source:
      trimmedFinalPrompt !== previous.final_prompt.trim()
        ? trimmedFinalPrompt
          ? "manual"
          : ""
        : draft.prompt_source,
  };
}

export function serializeReferenceVideoConfig(
  draft: BeatVideoConfigDraft,
  previous: BeatVideoConfigDraft,
): Record<string, unknown> {
  const config = serializeBeatVideoConfig(draft, previous);
  return {
    ...config,
    mode: normalizeReferenceVideoMode(draft.mode),
    resolution: draft.resolution,
    ratio: draft.ratio,
    generate_audio: false,
    return_last_frame: false,
    scene_optimize: "",
    human_review: false,
  };
}

export function getBeatVideoConfigSaveKey(
  beatNumber: number,
  config: Record<string, unknown>,
): string {
  return `${beatNumber}:${JSON.stringify(config)}`;
}

function defaultBeatVideoConfig(
  raw: Record<string, unknown>,
  defaultRatio: VideoAspectRatio,
): BeatVideoConfigDraft {
  const textOverlay =
    raw.text_overlay && typeof raw.text_overlay === "object" && !Array.isArray(raw.text_overlay)
      ? (raw.text_overlay as Record<string, unknown>)
      : {};
  return {
    managed: {
      prompt_validation_source: String(raw.prompt_validation_source ?? ""),
      prompt_inputs_hash: String(raw.prompt_inputs_hash ?? ""),
      prompt_updated_at: String(raw.prompt_updated_at ?? ""),
      reference_image_paths: stringList(raw.reference_image_paths),
      reference_video_paths: stringList(raw.reference_video_paths),
      reference_audio_paths: stringList(raw.reference_audio_paths),
      selected_asset_keys: stringList(raw.selected_asset_keys),
    },
    mode: normalizeVideoReferenceMode(raw.mode),
    duration: clampDuration(raw.duration),
    resolution: normalizeVideoResolution(raw.resolution),
    ratio: normalizeVideoAspectRatio(raw.ratio, defaultRatio),
    generate_audio:
      typeof raw.generate_audio === "boolean" ? raw.generate_audio : true,
    return_last_frame: raw.return_last_frame === true,
    scene_optimize: normalizeVideoSceneOptimize(raw.scene_optimize),
    human_review:
      typeof raw.human_review === "boolean" ? raw.human_review : true,
    prompt_source: String(raw.prompt_source ?? ""),
    prompt_guidance: String(raw.prompt_guidance ?? ""),
    final_prompt: String(raw.final_prompt ?? ""),
    text_overlay: {
      enabled: textOverlay.enabled === true,
      kind: normalizeVideoTextOverlayKind(textOverlay.kind),
      content: String(textOverlay.content ?? ""),
      placement: String(textOverlay.placement ?? "画面下方居中"),
      timing: String(textOverlay.timing ?? "全片持续"),
      style: String(textOverlay.style ?? "干净易读"),
      speaker: String(textOverlay.speaker ?? ""),
    },
  };
}

function normalizeVideoSceneOptimize(
  value: unknown,
): BeatVideoConfigDraft["scene_optimize"] {
  if (value === "anime" || value === "realistic") return value;
  return "";
}

function normalizeVideoTextOverlayKind(value: unknown): string {
  if (
    value === "ad_copy" ||
    value === "subtitle" ||
    value === "speech_bubble"
  ) {
    return value;
  }
  return "subtitle";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}
