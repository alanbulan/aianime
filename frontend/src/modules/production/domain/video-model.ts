// Copyright (c) 2026 AI anime

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
  profile: "standard" | "seedance2" | "happyhorse" | "grok";
  supportsAdvancedConfig: boolean;
  supportsNativeAudio: boolean;
  dialogueOnly: boolean;
  minDuration?: number;
  maxDuration?: number;
  resolutionOptions?: string[];
  sizeOptions?: string[];
  ratioOptions?: string[];
  supportedModes?: string[];
  referenceImageMax?: number;
  referenceVideoMax?: number;
  referenceAudioMax?: number;
}

export function videoModelOptionsFromCatalog(
  items: readonly VideoCatalogItem[],
): VideoModelOption[] {
  return items.map(videoModelOptionFromCatalog);
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
  const legacyMatches = options.filter(
    (option) => (option.apiModel ?? option.value) === persisted,
  );
  return legacyMatches.length === 1 ? legacyMatches[0] : undefined;
}

export function videoModelOptionFromCatalog(
  item: VideoCatalogItem,
): VideoModelOption {
  const capabilities = item.capabilities;
  const routeSelector = stringValue(capabilities.routeSelector);
  const properties = schemaProperties(item.parameterSchema);
  const profile = videoProfile(capabilities, item.code, item.displayName);
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
      profile !== "standard" ||
        properties.seconds ||
        properties.duration ||
        properties.size ||
        properties.resolution ||
        properties.input_reference,
    );

  return {
    value: routeSelector ?? item.code,
    apiModel: item.code,
    ...optional("routeSelector", routeSelector),
    label: item.displayName,
    profile,
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
    ...optionalArray("sizeOptions", sizeOptions),
    ...optionalArray("ratioOptions", ratioOptions),
    ...optionalArray("supportedModes", supportedModes),
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

function videoProfile(
  capabilities: Record<string, unknown>,
  code: string,
  displayName: string,
): VideoModelOption["profile"] {
  const declared = String(
    firstDefined(
      capabilities.videoProfile,
      capabilities.uiProfile,
      capabilities.family,
    ) ?? "",
  )
    .trim()
    .toLowerCase();
  const normalized = `${declared} ${code} ${displayName}`
    .replace(/[\s._-]/g, "")
    .toLowerCase();
  if (normalized.includes("happyhorse")) return "happyhorse";
  if (normalized.includes("grokvideo")) return "grok";
  if (normalized.includes("seedance2")) return "seedance2";
  return "standard";
}

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
