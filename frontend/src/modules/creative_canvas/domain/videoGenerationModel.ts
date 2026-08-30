// Copyright (c) 2026 AI anime
import type { VideoGenMode } from "./videoGenerationMode";

export type VideoGenQuality = "480P" | "720P" | "768P" | "1080P";
export type VideoSceneOptimize = string;
export type VideoOutputParameter = "resolution" | "size";

export interface VideoOutputDefinition {
  readonly parameter: VideoOutputParameter;
  readonly options: ReadonlyArray<string>;
  readonly defaultValue: string;
}

export interface VideoExtraParamDefinition {
  readonly key: string;
  readonly label: string;
  readonly type: "boolean" | "enum" | "number" | "string";
  readonly description?: string;
  readonly defaultValue?: boolean | number | string;
  readonly options?: Array<{ value: string; label: string }>;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface VideoModelCapabilityDescriptor {
  readonly parameterSchema?: Record<string, unknown>;
  readonly resolutionOptions?: ReadonlyArray<string>;
  readonly sizeOptions?: ReadonlyArray<string>;
  readonly supportsGenerateAudio?: boolean;
  readonly minDuration?: number | null;
  readonly maxDuration?: number | null;
  readonly defaultDuration?: number | null;
  readonly durationOptions?: ReadonlyArray<number>;
  readonly supportedModes?: ReadonlyArray<VideoGenMode>;
  readonly supportsHumanReview?: boolean;
  readonly supportsReferenceImages?: boolean;
  readonly supportsReferenceVideos?: boolean;
  readonly supportsReferenceAudios?: boolean;
  readonly maxReferenceImages?: number | null;
  readonly maxReferenceVideos?: number | null;
  readonly maxReferenceAudios?: number | null;
  readonly maxReferenceTotal?: number | null;
  readonly referenceAudioMinSeconds?: number | null;
  readonly referenceAudioMaxSeconds?: number | null;
  readonly referenceAudioTotalMinSeconds?: number | null;
  readonly referenceAudioTotalMaxSeconds?: number | null;
  readonly referenceVideoMinSeconds?: number | null;
  readonly referenceVideoMaxSeconds?: number | null;
  readonly referenceVideoTotalMinSeconds?: number | null;
  readonly referenceVideoTotalMaxSeconds?: number | null;
  readonly sceneOptimizeOptions?: ReadonlyArray<string>;
  readonly defaultSceneOptimize?: string | null;
}

export interface VideoDurationBounds {
  min: number;
  max: number;
}

export interface VideoDurationDefinition extends VideoDurationBounds {
  readonly defaultValue: number;
  readonly options: ReadonlyArray<number>;
}

export interface VideoReferenceDurationLimitsMs {
  readonly minMs?: number;
  readonly maxMs?: number;
  readonly totalMinMs?: number;
  readonly totalMaxMs?: number;
}

export function videoReferenceDurationLimitsForModel(
  model: VideoModelCapabilityDescriptor | null | undefined,
  media: "audio" | "video",
): VideoReferenceDurationLimitsMs {
  const prefix = media === "audio" ? "referenceAudio" : "referenceVideo";
  const readSeconds = (suffix: string): number | undefined => {
    const value = (model as Record<string, unknown> | null | undefined)?.[
      `${prefix}${suffix}`
    ];
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.round(value * 1000)
      : undefined;
  };
  return {
    minMs: readSeconds("MinSeconds"),
    maxMs: readSeconds("MaxSeconds"),
    totalMinMs: readSeconds("TotalMinSeconds"),
    totalMaxMs: readSeconds("TotalMaxSeconds"),
  };
}

const NON_EXTRA_VIDEO_PARAMETER_KEYS = new Set([
  "model",
  "prompt",
  "mode",
  "generation_mode",
  "generationMode",
  "seconds",
  "duration",
  "duration_seconds",
  "size",
  "resolution",
  "ratio",
  "aspect_ratio",
  "aspectRatio",
  "generate_audio",
  "generateAudio",
  "human_review",
  "humanReview",
  "scene_optimize",
  "sceneOptimize",
  "image",
  "images",
  "input_reference",
  "first_frame_image",
  "last_frame_image",
  "end_image",
  "reference_image",
  "reference_images",
  "reference_video",
  "reference_videos",
  "reference_audio",
  "reference_audios",
  "references",
  "n",
]);

export function videoOutputDefinitionForModel(
  model: VideoModelCapabilityDescriptor | null | undefined,
): VideoOutputDefinition | null {
  const properties = schemaProperties(model?.parameterSchema);
  const sizeOptions = uniqueStrings([
    ...(model?.sizeOptions ?? []),
    ...stringArray(properties.size?.enum),
  ]).filter(isExactVideoSize);
  if (sizeOptions.length > 0) {
    return {
      parameter: "size",
      options: sizeOptions,
      defaultValue: optionOrFallback(properties.size?.default, sizeOptions),
    };
  }

  const resolutionOptions = uniqueStrings([
    ...(model?.resolutionOptions ?? []),
    ...stringArray(properties.resolution?.enum),
  ]).filter((value) => !isExactVideoSize(value));
  if (resolutionOptions.length === 0) return null;
  return {
    parameter: "resolution",
    options: resolutionOptions,
    defaultValue: optionOrFallback(
      properties.resolution?.default,
      resolutionOptions,
    ),
  };
}

export function normalizeVideoOutput(
  value: unknown,
  definition: VideoOutputDefinition | null,
): string | null {
  if (!definition) return null;
  return optionOrFallback(value, definition.options, definition.defaultValue);
}

export function videoOutputForAspectRatio(
  definition: VideoOutputDefinition | null,
  aspectRatio: string,
  currentValue: string,
): string {
  if (!definition || definition.parameter !== "size") return currentValue;
  const target = parseRatio(aspectRatio);
  if (target === null) return currentValue;
  return nearestVideoSize(definition.options, target) ?? currentValue;
}

export function videoAspectRatioForOutput(
  outputValue: string,
  aspectRatioOptions: ReadonlyArray<string>,
  fallback: string,
): string {
  const sizeRatio = parseSizeRatio(outputValue);
  if (sizeRatio === null) return fallback;
  const candidates = aspectRatioOptions.flatMap((value) => {
    const ratio = parseRatio(value);
    return ratio === null ? [] : [{ value, ratio }];
  });
  if (candidates.length === 0) return fallback;
  return candidates.reduce((best, candidate) =>
    ratioDistance(candidate.ratio, sizeRatio) <
    ratioDistance(best.ratio, sizeRatio)
      ? candidate
      : best,
  ).value;
}

export function videoExtraParamDefinitionsForModel(
  model: VideoModelCapabilityDescriptor | null | undefined,
): VideoExtraParamDefinition[] {
  const definitions: VideoExtraParamDefinition[] = [];
  for (const [key, property] of Object.entries(
    schemaProperties(model?.parameterSchema),
  )) {
    if (NON_EXTRA_VIDEO_PARAMETER_KEYS.has(key)) continue;
    const enumValues = stringArray(property.enum);
    const type = typeof property.type === "string" ? property.type : "";
    const defaultValue = primitive(property.default);
    const description = typeof property.description === "string"
      ? property.description
      : undefined;
    const base = {
      key,
      label: typeof property.title === "string" && property.title.trim()
        ? property.title.trim()
        : key,
      ...(description ? { description } : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
    };
    if (enumValues.length > 0) {
      definitions.push({
        ...base,
        type: "enum",
        options: enumValues.map((option) => ({ value: option, label: option })),
      });
    } else if (type === "boolean") {
      definitions.push({ ...base, type: "boolean" });
    } else if (type === "number" || type === "integer") {
      const minimum = finiteNumber(property.minimum);
      const maximum = finiteNumber(property.maximum);
      const multipleOf = finiteNumber(property.multipleOf);
      definitions.push({
        ...base,
        type: "number",
        ...(minimum !== null ? { min: minimum } : {}),
        ...(maximum !== null ? { max: maximum } : {}),
        ...(multipleOf !== null
          ? { step: multipleOf }
          : type === "integer"
            ? { step: 1 }
            : {}),
      });
    } else if (type === "string") {
      definitions.push({ ...base, type: "string" });
    }
  }
  return definitions;
}

export function videoExtraParamsForModel(
  model: VideoModelCapabilityDescriptor | null | undefined,
  values: Record<string, unknown> | null | undefined,
): Record<string, boolean | number | string> {
  return Object.fromEntries(
    videoExtraParamDefinitionsForModel(model).flatMap((definition) => {
      const value = primitive(values?.[definition.key]);
      const resolved = value ?? definition.defaultValue;
      return resolved === undefined ? [] : [[definition.key, resolved]];
    }),
  );
}

export function videoSupportsGenerateAudio(
  model: VideoModelCapabilityDescriptor | null | undefined,
): boolean {
  return model?.supportsGenerateAudio === true;
}

export function videoDurationDefinitionForModel(
  model: VideoModelCapabilityDescriptor | null | undefined,
): VideoDurationDefinition | null {
  const min = finiteNumber(model?.minDuration);
  const max = finiteNumber(model?.maxDuration);
  const declaredDefault = finiteNumber(model?.defaultDuration);
  const options = Array.from(
    new Set(
      (model?.durationOptions ?? []).filter(
        (value) => Number.isFinite(value) && value > 0,
      ),
    ),
  ).sort((left, right) => left - right);
  const resolvedMin = min ?? options[0] ?? null;
  const resolvedMax = max ?? options[options.length - 1] ?? null;
  if (
    resolvedMin === null ||
    resolvedMax === null ||
    declaredDefault === null ||
    resolvedMin <= 0 ||
    resolvedMax < resolvedMin
  ) {
    return null;
  }
  const defaultValue = Math.min(
    Math.max(Math.round(declaredDefault), resolvedMin),
    resolvedMax,
  );
  return { min: resolvedMin, max: resolvedMax, defaultValue, options };
}

export function normalizeVideoDuration(
  value: number,
  definition: VideoDurationDefinition,
): number {
  const rounded = Math.round(value);
  if (definition.options.length === 0) {
    return clampVideoDuration(rounded, definition);
  }
  return definition.options.reduce((closest, option) =>
    Math.abs(option - rounded) < Math.abs(closest - rounded)
      ? option
      : closest,
  );
}

function schemaProperties(
  schema: Record<string, unknown> | null | undefined,
): Record<string, Record<string, unknown>> {
  const properties = schema?.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(properties).filter(
      (entry): entry is [string, Record<string, unknown>] =>
        Boolean(entry[1]) &&
        typeof entry[1] === "object" &&
        !Array.isArray(entry[1]),
    ),
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string =>
        typeof item === "string" && Boolean(item.trim()),
      )
    : [];
}

function uniqueStrings(values: ReadonlyArray<string>): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function isExactVideoSize(value: string): boolean {
  return /^\d{2,5}x\d{2,5}$/i.test(value.trim());
}

function optionOrFallback(
  value: unknown,
  options: ReadonlyArray<string>,
  preferredFallback?: string,
): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  const match = options.find((option) => option.toLowerCase() === normalized);
  if (match) return match;
  const preferred = preferredFallback
    ? options.find(
        (option) => option.toLowerCase() === preferredFallback.toLowerCase(),
      )
    : undefined;
  return preferred ?? options[0] ?? preferredFallback ?? "";
}

function parseRatio(value: string): number | null {
  const parts = value.split(":", 2).map(Number);
  if (
    parts.length !== 2 ||
    !Number.isFinite(parts[0]) ||
    !Number.isFinite(parts[1]) ||
    (parts[0] ?? 0) <= 0 ||
    (parts[1] ?? 0) <= 0
  ) {
    return null;
  }
  return (parts[0] as number) / (parts[1] as number);
}

function parseSizeRatio(value: string): number | null {
  const match = /^(\d{2,5})x(\d{2,5})$/i.exec(value.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : null;
}

function nearestVideoSize(
  options: ReadonlyArray<string>,
  targetRatio: number,
): string | null {
  const candidates = options.flatMap((value) => {
    const ratio = parseSizeRatio(value);
    return ratio === null ? [] : [{ value, ratio }];
  });
  return candidates.length === 0
    ? null
    : candidates.reduce((best, candidate) =>
        ratioDistance(candidate.ratio, targetRatio) <
        ratioDistance(best.ratio, targetRatio)
          ? candidate
          : best,
      ).value;
}

function ratioDistance(left: number, right: number): number {
  return Math.abs(Math.log(left / right));
}

function primitive(value: unknown): boolean | number | string | undefined {
  return typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "string"
    ? value
    : undefined;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  return (model?.supportedModes ?? []).includes(mode);
}

export function supportedVideoModesForModel(
  model: VideoModelCapabilityDescriptor | null | undefined,
): ReadonlyArray<VideoGenMode> {
  return model?.supportedModes ?? [];
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
  if (model?.supportedModes?.length) {
    const supportsAllReferences = model.supportedModes.includes("allReference");
    const supportsVideoEdit = model.supportedModes.includes("videoEdit");
    if (counts.videos > 0 && !supportsAllReferences && !supportsVideoEdit) {
      return "该模型不支持视频参考素材";
    }
    if (counts.audios > 0 && !supportsAllReferences) {
      return "该模型不支持音频参考素材";
    }
    if (
      counts.images > 1 &&
      !supportsAllReferences &&
      !model.supportedModes.includes("imageReference")
    ) {
      return "该模型单次仅支持 1 张参考图片";
    }
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
): ReadonlyArray<VideoSceneOptimize> {
  return uniqueStrings(model?.sceneOptimizeOptions ?? []);
}

export function defaultSceneOptimizeForModel(
  model: VideoModelCapabilityDescriptor | null | undefined,
): VideoSceneOptimize | undefined {
  const options = sceneOptimizeOptionsForModel(model);
  const declaredDefault = String(model?.defaultSceneOptimize ?? "").trim();
  return declaredDefault && options.includes(declaredDefault)
    ? declaredDefault
    : options[0];
}

export function normalizeSceneOptimize(
  value: VideoSceneOptimize | undefined,
  options: ReadonlyArray<VideoSceneOptimize>,
  fallback: VideoSceneOptimize | undefined,
): VideoSceneOptimize | undefined {
  if (options.length === 0) return undefined;
  if (value && options.includes(value)) return value;
  return fallback && options.includes(fallback) ? fallback : options[0];
}
export type VideoGenCount = 1 | 2 | 4;
