// Copyright (c) 2026 AI anime

export type VideoWorkflow = "standard" | "advanced-reference" | "reference";

const VIDEO_WORKFLOWS = new Set<VideoWorkflow>([
  "standard",
  "advanced-reference",
  "reference",
]);

function resolveVideoWorkflow(capabilities: Record<string, unknown>): VideoWorkflow {
  const declared = String(capabilities.videoWorkflow ?? "").trim().toLowerCase();
  return VIDEO_WORKFLOWS.has(declared as VideoWorkflow)
    ? (declared as VideoWorkflow)
    : "standard";
}

export interface VideoCatalogItem {
  code: string;
  displayName: string;
  capabilities: Record<string, unknown>;
  parameterSchema: Record<string, unknown>;
}

export interface VideoModelOption {
  value: string;
  apiModel?: string;
  routeSelector?: string;
  label: string;
  workflow: VideoWorkflow;
  supportsAdvancedConfig: boolean;
  supportsNativeAudio: boolean;
  dialogueOnly: boolean;
  minDuration?: number;
  maxDuration?: number;
  resolutionOptions?: string[];
  resolutionMaxSeconds?: Record<string, number>;
  sizeOptions?: string[];
  ratioOptions?: string[];
  supportedModes?: string[];
  sceneOptimizeOptions?: string[];
  extraParameterNames?: string[];
  referenceImageMax?: number;
  referenceVideoMax?: number;
  referenceAudioMax?: number;
}

export function videoModelOptionsFromCatalog(
  items: readonly VideoCatalogItem[],
): VideoModelOption[] {
  return items.flatMap((item) => {
    const routeSelector = stringValue(item.capabilities.routeSelector);
    return routeSelector
      ? [videoModelOptionFromCatalog(item, routeSelector)]
      : [];
  });
}

export function resolveAuthorizedVideoModel(
  options: readonly Pick<VideoModelOption, "value" | "apiModel">[],
  persistedModel: string | null | undefined,
): string {
  return (
    resolveVideoModelOption(options, persistedModel)?.value ??
    options[0]?.value ??
    ""
  );
}

export function resolveVideoModelOption<
  T extends Pick<VideoModelOption, "value" | "apiModel">,
>(
  options: readonly T[],
  persistedModel: string | null | undefined,
): T | undefined {
  const persisted = String(persistedModel ?? "").trim();
  const exact = options.find((option) => option.value === persisted);
  if (exact) return exact;
  return undefined;
}

function videoModelOptionFromCatalog(
  item: VideoCatalogItem,
  routeSelector: string,
): VideoModelOption {
  const capabilities = item.capabilities;
  const properties = schemaProperties(item.parameterSchema);
  const workflow = resolveVideoWorkflow(capabilities);
  const declaredResolutionOptions = stringArray(
    firstDefined(
      capabilities.resolutionOptions,
      capabilities.resolutions,
      properties.resolution?.enum,
    ),
  );
  const sizeOptions = unique(
    [...declaredResolutionOptions, ...stringArray(properties.size?.enum)]
      .map(normalizeVideoSizeValue)
      .filter((value): value is string => value !== null),
  );
  const declaredResolutionTiers = unique(
    declaredResolutionOptions
      .map(normalizeVideoResolutionTier)
      .filter((value): value is string => value !== null),
  );
  const resolutionOptions = declaredResolutionTiers.length
    ? declaredResolutionTiers
    : resolutionTiersFromSizes(sizeOptions);
  const declaredRatioOptions = stringArray(
    firstDefined(
      capabilities.ratioOptions,
      capabilities.aspectRatios,
      properties.ratio?.enum,
      properties.aspect_ratio?.enum,
    ),
  );
  const ratioOptions = unique(
    declaredRatioOptions.length
      ? declaredRatioOptions
      : ratioOptionsFromSizes(sizeOptions),
  );
  const supportedModes = stringArray(
    firstDefined(capabilities.supportedModes, capabilities.modes),
  );
  const sceneOptimizeOptions = stringArray(
    firstDefined(
      capabilities.sceneOptimizeOptions,
      properties.scene_optimize?.enum,
      properties.sceneOptimize?.enum,
    ),
  );
  const extraParameterNames = unique(
    Object.keys(properties).filter(
      (name) => !VIDEO_CORE_PARAMETER_NAMES.has(name),
    ),
  );
  const minDuration = finiteNumber(
    firstDefined(
      capabilities.minDuration,
      properties.seconds?.minimum,
      properties.duration?.minimum,
    ),
  );
  const maxDuration = finiteNumber(
    firstDefined(
      capabilities.maxDuration,
      properties.seconds?.maximum,
      properties.duration?.maximum,
    ),
  );
  const supportsAdvancedConfig =
    booleanValue(capabilities.advancedConfig) ??
    Boolean(
      workflow !== "standard" ||
        properties.seconds ||
        properties.duration ||
        properties.size ||
        properties.resolution ||
        properties.input_reference,
    );

  return {
    value: routeSelector,
    apiModel: item.code,
    routeSelector,
    label: item.displayName,
    workflow,
    supportsAdvancedConfig,
    supportsNativeAudio:
      booleanValue(
        firstDefined(
          capabilities.generateAudio,
          capabilities.nativeAudio,
          capabilities.audio,
        ),
      ) ?? Boolean(properties.generate_audio),
    dialogueOnly: booleanValue(capabilities.dialogueOnly) ?? false,
    ...optional("minDuration", minDuration),
    ...optional("maxDuration", maxDuration),
    ...optionalArray(
      "resolutionOptions",
      resolutionOptions,
    ),
    ...optional(
      "resolutionMaxSeconds",
      positiveNumberRecord(
        firstDefined(
          capabilities.videoResolutionMaxSeconds,
          capabilities.resolutionMaxSeconds,
        ),
      ),
    ),
    ...optionalArray("sizeOptions", sizeOptions),
    ...optionalArray("ratioOptions", ratioOptions),
    ...optionalArray("supportedModes", supportedModes),
    ...optionalArray("sceneOptimizeOptions", sceneOptimizeOptions),
    ...optionalArray("extraParameterNames", extraParameterNames),
    ...optional(
      "referenceImageMax",
      finiteNumber(capabilities.referenceImageMax),
    ),
    ...optional(
      "referenceVideoMax",
      finiteNumber(capabilities.referenceVideoMax),
    ),
    ...optional(
      "referenceAudioMax",
      finiteNumber(capabilities.referenceAudioMax),
    ),
  };
}

const VIDEO_CORE_PARAMETER_NAMES = new Set([
  "model",
  "prompt",
  "mode",
  "seconds",
  "duration",
  "size",
  "resolution",
  "ratio",
  "aspect_ratio",
  "generate_audio",
  "human_review",
  "scene_optimize",
  "image",
  "images",
  "input_reference",
  "first_frame_image",
  "last_frame_image",
  "reference_images",
  "reference_videos",
  "reference_audios",
  "references",
]);

function schemaProperties(
  schema: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const value = schema.properties;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, Record<string, unknown>] =>
        Boolean(entry[1]) && typeof entry[1] === "object" && !Array.isArray(entry[1]),
    ),
  );
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function positiveNumberRecord(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value)
    .map(([key, item]) => [key.trim().toLowerCase(), item] as const)
    .filter(
      (entry): entry is readonly [string, number] =>
        /^\d{2,5}p$/.test(entry[0]) &&
        typeof entry[1] === "number" &&
        Number.isFinite(entry[1]) &&
        entry[1] > 0,
    );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeVideoResolutionTier(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (["480p", "720p", "768p", "1080p"].includes(normalized)) {
    return normalized;
  }
  return null;
}

function normalizeVideoSizeValue(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(normalized);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width >= 64 && width <= 8192 && height >= 64 && height <= 8192
    ? `${width}x${height}`
    : null;
}

function resolutionTiersFromSizes(sizeOptions: readonly string[]): string[] {
  const tiers = new Map<number, string>([
    [480, "480p"],
    [720, "720p"],
    [768, "768p"],
    [1080, "1080p"],
  ]);
  return unique(
    sizeOptions
      .map((size) => {
        const [width, height] = size.split("x").map(Number);
        return tiers.get(Math.min(width, height)) ?? null;
      })
      .filter((value): value is string => value !== null),
  );
}

function ratioOptionsFromSizes(sizeOptions: readonly string[]): string[] {
  const candidates = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
  return unique(
    sizeOptions.map((size) => {
      const [width, height] = size.split("x").map(Number);
      const frameRatio = width / height;
      return candidates.reduce((closest, candidate) => {
        const [candidateWidth, candidateHeight] = candidate.split(":").map(Number);
        const candidateRatio = candidateWidth / candidateHeight;
        const closestParts = closest.split(":").map(Number);
        const closestRatio = closestParts[0] / closestParts[1];
        return Math.abs(Math.log(frameRatio / candidateRatio)) <
          Math.abs(Math.log(frameRatio / closestRatio))
          ? candidate
          : closest;
      });
    }),
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function optional<K extends string, V>(key: K, value: V | undefined) {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function optionalArray<K extends string>(key: K, value: string[]) {
  return value.length === 0 ? {} : ({ [key]: unique(value) } as Record<K, string[]>);
}
