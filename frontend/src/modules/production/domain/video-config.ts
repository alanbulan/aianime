// Copyright (c) 2026 AI anime
import type { VideoModelOption } from "@/modules/production/domain/video-model";

const SEEDANCE2_DEFAULT_RESOLUTION_OPTIONS = ["480p", "720p"] as const;
const HAPPYHORSE_RESOLUTION_OPTIONS = ["720p", "1080p"] as const;
const HAPPYHORSE_RATIO_OPTIONS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
const GROK_VIDEO_RESOLUTION_OPTIONS = ["720p", "480p"] as const;
const GROK_VIDEO_RATIO_OPTIONS = ["16:9", "9:16", "1:1", "2:3", "3:2"] as const;
const SEEDANCE2_RESOLUTION_OPTIONS_BY_MODEL = {
  "seedance-2.0-fast": ["480p", "720p"],
  "seedance-2.0": ["480p", "720p", "1080p"],
  "seedance-2.0-value": ["720p", "1080p"],
  "seedance-2.0-fast-value": ["720p", "1080p"],
  "seedance-1.5-pro": ["480p", "720p", "1080p"],
} as const;

export type Seedance2Resolution = "480p" | "720p" | "1080p";
export type HappyHorseRatio = (typeof HAPPYHORSE_RATIO_OPTIONS)[number];
export type GrokVideoRatio = (typeof GROK_VIDEO_RATIO_OPTIONS)[number];
export type Seedance2Mode =
  | "first_frame"
  | "first_last_frame"
  | "multimodal_reference";
export type Seedance2Ratio =
  | "9:16"
  | "16:9"
  | "1:1"
  | "4:3"
  | "3:4"
  | "21:9"
  | "2:3"
  | "3:2";

export interface Seedance2DurationBounds {
  min: number;
  max: number;
}

export interface Seedance2ConfigDraft {
  raw: Record<string, unknown>;
  mode: Seedance2Mode;
  mode_user_set: boolean;
  duration: number;
  resolution: Seedance2Resolution;
  ratio: Seedance2Ratio;
  generate_audio: boolean;
  generate_audio_user_set: boolean;
  return_last_frame: boolean;
  scene_optimize: "" | "anime" | "realistic";
  human_review: boolean;
  human_review_user_set: boolean;
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
  | "minDuration"
  | "maxDuration"
>;

export function parseSeedance2Config(
  value: string | null | undefined,
  defaultRatio: Seedance2Ratio = "9:16",
): Seedance2ConfigDraft {
  const text = String(value ?? "").trim();
  if (!text) return defaultSeedance2Config({}, defaultRatio);
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return defaultSeedance2Config(parsed as Record<string, unknown>, defaultRatio);
    }
  } catch {
    return defaultSeedance2Config({ final_prompt: text }, defaultRatio);
  }
  return defaultSeedance2Config({}, defaultRatio);
}

export function seedance2DefaultRatioForProjectAspect(
  aspect: "2:3" | "16:9",
): Seedance2Ratio {
  return aspect === "16:9" ? "16:9" : "9:16";
}

export function normalizeSeedance2Mode(value: unknown): Seedance2Mode {
  if (
    value === "first_frame" ||
    value === "first_last_frame" ||
    value === "multimodal_reference"
  ) {
    return value;
  }
  return "multimodal_reference";
}

export function isSeedance2ValueModel(value: string | null | undefined): boolean {
  const text = normalizeVideoModelId(value);
  return text === "seedance-2.0-value" || text === "seedance-2.0-fast-value";
}

export function normalizeVideoModelId(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function videoModelDisplayLabel(
  value: string | null | undefined,
  labels: ReadonlyMap<string, string>,
): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const exact = labels.get(text);
  if (exact) return exact;
  const model = normalizeVideoModelId(text);
  if (model.startsWith("seedance-2.0")) {
    return `Seedance ${model.slice("seedance-".length)}`;
  }
  return text;
}

export function isSeedance15ProModel(value: string | null | undefined): boolean {
  return normalizeVideoModelId(value) === "seedance-1.5-pro";
}

export function seedance2ResolutionOptionsForModel(
  value: string | null | undefined,
): readonly Seedance2Resolution[] {
  const model = normalizeVideoModelId(value);
  return (
    SEEDANCE2_RESOLUTION_OPTIONS_BY_MODEL[
      model as keyof typeof SEEDANCE2_RESOLUTION_OPTIONS_BY_MODEL
    ] ?? SEEDANCE2_DEFAULT_RESOLUTION_OPTIONS
  );
}

export function normalizeSeedance2DraftForModel(
  draft: Seedance2ConfigDraft,
  resolutionOptions: readonly Seedance2Resolution[],
  model: string | null | undefined,
  isValueStyle: boolean,
): Seedance2ConfigDraft {
  const fallbackResolution = resolutionOptions.includes("720p")
    ? "720p"
    : resolutionOptions[0] || "720p";
  const resolution = resolutionOptions.includes(draft.resolution)
    ? draft.resolution
    : fallbackResolution;
  const sceneOptimize = isValueStyle
    ? draft.scene_optimize || defaultSeedance2ValueSceneOptimize(model)
    : "";
  if (draft.resolution === resolution && draft.scene_optimize === sceneOptimize) {
    return draft;
  }
  return {
    ...draft,
    resolution,
    scene_optimize: sceneOptimize,
  };
}

export function happyHorseResolutionOptionsForModel(
  model: VideoModelConfigCapabilities | null | undefined,
): readonly Seedance2Resolution[] {
  const options = model?.resolutionOptions?.filter(
    (value): value is Seedance2Resolution =>
      value === "720p" || value === "1080p",
  );
  return options?.length ? options : HAPPYHORSE_RESOLUTION_OPTIONS;
}

export function happyHorseRatioOptionsForModel(
  model: VideoModelConfigCapabilities | null | undefined,
): readonly HappyHorseRatio[] {
  const options = model?.ratioOptions?.filter(
    (value): value is HappyHorseRatio =>
      value === "16:9" ||
      value === "9:16" ||
      value === "1:1" ||
      value === "4:3" ||
      value === "3:4",
  );
  return options?.length ? options : HAPPYHORSE_RATIO_OPTIONS;
}

export function grokVideoResolutionOptionsForModel(
  model: VideoModelConfigCapabilities | null | undefined,
): readonly Seedance2Resolution[] {
  const options = model?.resolutionOptions?.filter(
    (value): value is Seedance2Resolution => value === "720p" || value === "480p",
  );
  return options?.length ? options : GROK_VIDEO_RESOLUTION_OPTIONS;
}

export function grokVideoRatioOptionsForModel(
  model: VideoModelConfigCapabilities | null | undefined,
): readonly GrokVideoRatio[] {
  const options = model?.ratioOptions?.filter(
    (value): value is GrokVideoRatio =>
      value === "16:9" ||
      value === "9:16" ||
      value === "1:1" ||
      value === "2:3" ||
      value === "3:2",
  );
  return options?.length ? options : GROK_VIDEO_RATIO_OPTIONS;
}

export function normalizeHappyHorseMode(value: unknown): Seedance2Mode {
  return value === "first_frame" ? "first_frame" : "multimodal_reference";
}

export function normalizeHappyHorseRatio(
  value: unknown,
  fallback: HappyHorseRatio = "16:9",
): HappyHorseRatio {
  return HAPPYHORSE_RATIO_OPTIONS.includes(value as HappyHorseRatio)
    ? (value as HappyHorseRatio)
    : fallback;
}

export function normalizeGrokVideoRatio(
  value: unknown,
  fallback: GrokVideoRatio = "16:9",
): GrokVideoRatio {
  return GROK_VIDEO_RATIO_OPTIONS.includes(value as GrokVideoRatio)
    ? (value as GrokVideoRatio)
    : fallback;
}

export function normalizeHappyHorseDraftForModel(
  draft: Seedance2ConfigDraft,
  resolutionOptions: readonly Seedance2Resolution[],
  ratioOptions: readonly HappyHorseRatio[],
): Seedance2ConfigDraft {
  const fallbackResolution = resolutionOptions.includes("1080p")
    ? "1080p"
    : resolutionOptions[0] || "720p";
  const resolution = resolutionOptions.includes(draft.resolution)
    ? draft.resolution
    : fallbackResolution;
  const fallbackRatio = ratioOptions[0] || "16:9";
  const ratio = ratioOptions.includes(draft.ratio as HappyHorseRatio)
    ? draft.ratio
    : fallbackRatio;
  const mode = normalizeHappyHorseMode(draft.mode);
  if (
    draft.mode === mode &&
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
    mode_user_set: true,
    resolution,
    ratio,
    generate_audio: false,
    generate_audio_user_set: false,
    return_last_frame: false,
    scene_optimize: "",
    human_review: false,
    human_review_user_set: false,
  };
}

export function normalizeGrokVideoDraftForModel(
  draft: Seedance2ConfigDraft,
  resolutionOptions: readonly Seedance2Resolution[],
  ratioOptions: readonly GrokVideoRatio[],
): Seedance2ConfigDraft {
  const fallbackResolution = resolutionOptions.includes("720p")
    ? "720p"
    : resolutionOptions[0] || "720p";
  const resolution = resolutionOptions.includes(draft.resolution)
    ? draft.resolution
    : fallbackResolution;
  const fallbackRatio = ratioOptions[0] || "16:9";
  const ratio = ratioOptions.includes(draft.ratio as GrokVideoRatio)
    ? draft.ratio
    : fallbackRatio;
  const mode = normalizeHappyHorseMode(draft.mode);
  if (
    draft.mode === mode &&
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
    mode_user_set: true,
    resolution,
    ratio,
    generate_audio: false,
    generate_audio_user_set: false,
    return_last_frame: false,
    scene_optimize: "",
    human_review: false,
    human_review_user_set: false,
  };
}

export function videoDurationBoundsForModel(
  model: VideoModelConfigCapabilities | null | undefined,
): Seedance2DurationBounds {
  const min = Number(model?.minDuration);
  const max = Number(model?.maxDuration);
  const safeMin = Number.isFinite(min) && min > 0 ? Math.round(min) : 1;
  const safeMax = Number.isFinite(max) && max >= safeMin ? Math.round(max) : 15;
  return { min: safeMin, max: safeMax };
}

export function normalizeSeedance2Resolution(
  value: unknown,
  fallback: Seedance2Resolution = "720p",
): Seedance2Resolution {
  if (value === "480p" || value === "720p" || value === "1080p") return value;
  return fallback;
}

export function normalizeSeedance2Ratio(
  value: unknown,
  fallback: Seedance2Ratio = "9:16",
): Seedance2Ratio {
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
  bounds: Seedance2DurationBounds = { min: 1, max: 15 },
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(bounds.min, Math.min(bounds.max, 5));
  }
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(parsed)));
}

export function sameSeedance2Config(
  left: Seedance2ConfigDraft,
  right: Seedance2ConfigDraft,
): boolean {
  return (
    left.mode === right.mode &&
    left.mode_user_set === right.mode_user_set &&
    left.duration === right.duration &&
    left.resolution === right.resolution &&
    left.ratio === right.ratio &&
    left.generate_audio === right.generate_audio &&
    left.generate_audio_user_set === right.generate_audio_user_set &&
    left.return_last_frame === right.return_last_frame &&
    left.scene_optimize === right.scene_optimize &&
    left.human_review === right.human_review &&
    left.human_review_user_set === right.human_review_user_set &&
    left.prompt_guidance === right.prompt_guidance &&
    left.final_prompt === right.final_prompt &&
    JSON.stringify(left.text_overlay) === JSON.stringify(right.text_overlay)
  );
}

export function serializeSeedance2Config(
  draft: Seedance2ConfigDraft,
  previous: Seedance2ConfigDraft,
): Record<string, unknown> {
  // Keep final_prompt verbatim so an inserted mention's separator space survives autosave.
  const finalPrompt = draft.final_prompt;
  const trimmedFinalPrompt = finalPrompt.trim();
  return {
    ...draft.raw,
    mode: draft.mode,
    mode_user_set: draft.mode_user_set,
    duration: draft.duration,
    resolution: draft.resolution,
    ratio: draft.ratio,
    generate_audio: true,
    generate_audio_user_set: false,
    return_last_frame: draft.return_last_frame,
    scene_optimize: draft.scene_optimize,
    human_review: draft.human_review,
    human_review_user_set: draft.human_review_user_set,
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

export function serializeHappyHorseConfig(
  draft: Seedance2ConfigDraft,
  previous: Seedance2ConfigDraft,
): Record<string, unknown> {
  const config = serializeSeedance2Config(draft, previous);
  return {
    ...config,
    mode: normalizeHappyHorseMode(draft.mode),
    mode_user_set: true,
    resolution: draft.resolution === "720p" ? "720p" : "1080p",
    ratio: normalizeHappyHorseRatio(draft.ratio),
    generate_audio: false,
    generate_audio_user_set: false,
    return_last_frame: false,
    scene_optimize: "",
    human_review: false,
    human_review_user_set: false,
  };
}

export function serializeGrokVideoConfig(
  draft: Seedance2ConfigDraft,
  previous: Seedance2ConfigDraft,
): Record<string, unknown> {
  const config = serializeSeedance2Config(draft, previous);
  return {
    ...config,
    mode: normalizeHappyHorseMode(draft.mode),
    mode_user_set: true,
    resolution: draft.resolution === "480p" ? "480p" : "720p",
    ratio: normalizeGrokVideoRatio(draft.ratio),
    generate_audio: false,
    generate_audio_user_set: false,
    return_last_frame: false,
    scene_optimize: "",
    human_review: false,
    human_review_user_set: false,
  };
}

export function getSeedance2ConfigSaveKey(
  beatNumber: number,
  config: Record<string, unknown>,
): string {
  return `${beatNumber}:${JSON.stringify(config)}`;
}

function defaultSeedance2Config(
  raw: Record<string, unknown>,
  defaultRatio: Seedance2Ratio,
): Seedance2ConfigDraft {
  const textOverlay =
    raw.text_overlay && typeof raw.text_overlay === "object" && !Array.isArray(raw.text_overlay)
      ? (raw.text_overlay as Record<string, unknown>)
      : {};
  const modeUserSet = raw.mode_user_set === true;
  const rawMode = normalizeSeedance2Mode(raw.mode);
  return {
    raw,
    mode: !modeUserSet && raw.mode === "first_frame" ? "multimodal_reference" : rawMode,
    mode_user_set: modeUserSet,
    duration: clampDuration(raw.duration),
    resolution: normalizeSeedance2Resolution(raw.resolution),
    ratio: normalizeSeedance2Ratio(raw.ratio, defaultRatio),
    generate_audio_user_set: false,
    generate_audio: true,
    return_last_frame: raw.return_last_frame === true,
    scene_optimize: normalizeSeedance2SceneOptimize(raw.scene_optimize),
    human_review_user_set: raw.human_review_user_set === true,
    human_review:
      raw.human_review === false && raw.human_review_user_set === true
        ? false
        : true,
    prompt_source: String(raw.prompt_source ?? ""),
    prompt_guidance: String(raw.prompt_guidance ?? ""),
    final_prompt: String(raw.final_prompt ?? ""),
    text_overlay: {
      enabled: textOverlay.enabled === true,
      kind: normalizeSeedance2TextOverlayKind(textOverlay.kind),
      content: String(textOverlay.content ?? ""),
      placement: String(textOverlay.placement ?? "画面下方居中"),
      timing: String(textOverlay.timing ?? "全片持续"),
      style: String(textOverlay.style ?? "干净易读"),
      speaker: String(textOverlay.speaker ?? ""),
    },
  };
}

function defaultSeedance2ValueSceneOptimize(
  value: string | null | undefined,
): Seedance2ConfigDraft["scene_optimize"] {
  const text = String(value ?? "").trim().toLowerCase();
  return text.includes("fast-value") ? "realistic" : "anime";
}

function normalizeSeedance2SceneOptimize(
  value: unknown,
): Seedance2ConfigDraft["scene_optimize"] {
  if (value === "anime" || value === "realistic") return value;
  return "";
}

function normalizeSeedance2TextOverlayKind(value: unknown): string {
  if (
    value === "ad_copy" ||
    value === "subtitle" ||
    value === "speech_bubble"
  ) {
    return value;
  }
  if (value === "caption") return "subtitle";
  return "subtitle";
}
