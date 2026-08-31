// Copyright (c) 2026 AI anime

import { verifyOfflineLease } from "./commercial-lease.js";
import {
  BYOK_MODEL_ROLES,
  fetchByokModelCatalog,
  normalizeCommercialModelMode,
  type ByokModelAssignment,
  type ByokModelRole,
  type CommercialModelAccessStatus,
} from "./commercial-model-access.js";
import {
  projectCommercialModelCatalog,
  type CommercialAuthorizationSnapshot,
  type CommercialModelCapabilitySnapshot,
} from "./commercial-contracts.js";
import {
  CommercialApiError,
  optionalRecord,
  optionalText,
  requiredInteger,
  requiredRawText,
  requiredRecord,
  requiredText,
  type CommercialBootstrapQuery,
  type CommercialInvocationQuery,
  type CommercialLoginInput,
  type CommercialRememberedLoginInput,
  type CommercialModelCatalogQuery,
  type CommercialProfileUpdateInput,
  type CommercialRegistrationInput,
} from "./commercial-api-client.js";

export interface CommercialLeaseVerificationOptions {
  leaseSigningKeys?: Record<string, string>;
  devicePublicKeyHash?: string;
}

const REFERENCE_DURATION_CAPABILITY_FIELDS = [
  ["referenceAudioMinSeconds", ["referenceAudioMinSeconds"]],
  [
    "referenceAudioMaxSeconds",
    ["referenceAudioMaxSeconds", "referenceAudioItemMaxDuration"],
  ],
  ["referenceAudioTotalMinSeconds", ["referenceAudioTotalMinSeconds"]],
  [
    "referenceAudioTotalMaxSeconds",
    ["referenceAudioTotalMaxSeconds", "referenceAudioTotalMaxDuration"],
  ],
  ["referenceVideoMinSeconds", ["referenceVideoMinSeconds"]],
  [
    "referenceVideoMaxSeconds",
    ["referenceVideoMaxSeconds", "referenceVideoItemMaxDuration"],
  ],
  ["referenceVideoTotalMinSeconds", ["referenceVideoTotalMinSeconds"]],
  [
    "referenceVideoTotalMaxSeconds",
    ["referenceVideoTotalMaxSeconds", "referenceVideoTotalMaxDuration"],
  ],
] as const;

const VIDEO_CORE_PARAMETER_NAMES = new Set([
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

function positiveNumber(...values: unknown[]): number | undefined {
  return values.find(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function declaredBoolean(...values: unknown[]): boolean | undefined {
  return values.find((value): value is boolean => typeof value === "boolean");
}

function positiveNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is number =>
          typeof item === "number" && Number.isFinite(item) && item > 0,
      )
    : [];
}

function positiveNumberRecord(value: unknown): Record<string, number> | undefined {
  const record = optionalRecord(value);
  const entries = Object.entries(record)
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

function projectedVideoExtraParameterNames(
  properties: Record<string, unknown>,
): string[] {
  return Object.keys(properties).filter(
    (key) =>
      /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) &&
      !VIDEO_CORE_PARAMETER_NAMES.has(key),
  );
}

const UNIVERSAL_PARAMETER_NAMES = new Set([
  "model",
  "prompt",
  "input",
  "content",
]);

function projectedExtraParameterNames(
  properties: Record<string, unknown>,
): string[] {
  return Object.keys(properties).filter(
    (key) =>
      /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) &&
      !UNIVERSAL_PARAMETER_NAMES.has(key),
  );
}

function videoResolutionFromValue(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^\d{2,5}p$/.test(normalized) ? normalized : null;
}

function videoRatioFromValue(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized === "auto" || /^\d{1,4}:\d{1,4}$/.test(normalized)
    ? normalized
    : null;
}

function videoSizeFromValue(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(normalized);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 64 || width > 8192 || height < 64 || height > 8192) {
    return null;
  }
  return `${width}x${height}`;
}

function projectedVideoResolutionOptions(
  capabilities: Record<string, unknown>,
  properties: Record<string, unknown>,
): string[] {
  const resolutionProperty = optionalRecord(properties.resolution);
  const candidates = [
    capabilities.resolutionOptions,
    capabilities.resolutions,
    resolutionProperty.enum,
  ].flatMap(stringArray);
  return Array.from(
    new Set(
      candidates
        .map(videoResolutionFromValue)
        .filter((value): value is string => value !== null),
    ),
  );
}

function projectedVideoRatioOptions(
  capabilities: Record<string, unknown>,
  properties: Record<string, unknown>,
): string[] {
  const aspectRatioProperty = optionalRecord(properties.aspect_ratio);
  const aspectRatioCamelProperty = optionalRecord(properties.aspectRatio);
  const candidates = [
    capabilities.aspectRatioOptions,
    capabilities.ratioOptions,
    capabilities.aspectRatios,
    aspectRatioProperty.enum,
    aspectRatioCamelProperty.enum,
  ].flatMap(stringArray);
  return Array.from(
    new Set(
      candidates
        .map(videoRatioFromValue)
        .filter((value): value is string => value !== null),
    ),
  );
}

function projectedVideoSizeOptions(
  capabilities: Record<string, unknown>,
  properties: Record<string, unknown>,
): string[] {
  const resolutionProperty = optionalRecord(properties.resolution);
  const sizeProperty = optionalRecord(properties.size);
  const candidates = [
    capabilities.resolutionOptions,
    capabilities.resolutions,
    resolutionProperty.enum,
    sizeProperty.enum,
  ].flatMap(stringArray);
  return Array.from(
    new Set(
      candidates
        .map(videoSizeFromValue)
        .filter((value): value is string => value !== null),
    ),
  );
}

function parseCatalogRecord(
  value: string | undefined,
  modelCode: string,
  fieldName: string,
): Record<string, unknown> {
  if (!value) return {};
  try {
    return optionalRecord(JSON.parse(value));
  } catch {
    throw new CommercialApiError(
      `模型 ${modelCode} 的 ${fieldName} 不是有效 JSON`,
    );
  }
}

function catalogModelRuntimeMetadata(
  item: ReturnType<typeof projectCommercialModelCatalog>["items"][number],
): Pick<
  ByokModelAssignment,
  "contextWindow" | "maxOutputTokens" | "reasoningEfforts" | "defaultReasoningEffort"
> {
  const capabilities = parseCatalogRecord(
    item.capabilityJson,
    item.code,
    "capabilityJson",
  );
  const parameterSchema = parseCatalogRecord(
    item.parameterSchemaJson,
    item.code,
    "parameterSchemaJson",
  );
  const properties = optionalRecord(parameterSchema.properties);
  const reasoning = optionalRecord(
    properties.reasoning_effort ?? properties.reasoningEffort,
  );
  const reasoningEfforts = Array.isArray(reasoning.enum)
    ? Array.from(new Set(
        reasoning.enum
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean),
      ))
    : [];
  const requestedDefault = typeof reasoning.default === "string"
    ? reasoning.default.trim()
    : "";
  const contextWindow = firstPositiveInteger(
    capabilities.contextWindowTokens,
    capabilities.context_window_tokens,
    capabilities.contextWindow,
    capabilities.context_window,
    capabilities.contextLength,
    capabilities.context_length,
    parameterSchema.contextWindowTokens,
    parameterSchema.context_window_tokens,
  );
  const maxOutputTokens = firstPositiveInteger(
    capabilities.maxOutputTokens,
    capabilities.max_output_tokens,
    capabilities.outputTokenLimit,
    capabilities.output_token_limit,
    capabilities.maxCompletionTokens,
    capabilities.max_completion_tokens,
    capabilities.maxTokens,
    capabilities.max_tokens,
    parameterSchema.maxOutputTokens,
    parameterSchema.max_output_tokens,
    parameterSchema.maxCompletionTokens,
    parameterSchema.max_completion_tokens,
    parameterSchema.maxTokens,
    parameterSchema.max_tokens,
    optionalRecord(parameterSchema.maxOutputTokens).maximum,
    optionalRecord(parameterSchema.max_output_tokens).maximum,
    optionalRecord(parameterSchema.maxCompletionTokens).maximum,
    optionalRecord(parameterSchema.max_completion_tokens).maximum,
    optionalRecord(parameterSchema.maxTokens).maximum,
    optionalRecord(parameterSchema.max_tokens).maximum,
    optionalRecord(properties.maxOutputTokens).maximum,
    optionalRecord(properties.max_output_tokens).maximum,
    optionalRecord(properties.maxCompletionTokens).maximum,
    optionalRecord(properties.max_completion_tokens).maximum,
    optionalRecord(properties.maxTokens).maximum,
    optionalRecord(properties.max_tokens).maximum,
  );
  return {
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...(reasoningEfforts.length ? { reasoningEfforts } : {}),
    ...(requestedDefault && reasoningEfforts.includes(requestedDefault)
      ? { defaultReasoningEffort: requestedDefault }
      : {}),
  };
}

function firstPositiveInteger(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

function firstNonNegativeInteger(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
      return value;
    }
  }
  return undefined;
}

export function mergeModelCapabilities(
  catalog: ReturnType<typeof projectCommercialModelCatalog> | null,
  target: Map<string, CommercialModelCapabilitySnapshot>,
): void {
  for (const item of catalog?.items ?? []) {
    target.delete(item.code);
    if (item.operation !== "VIDEO" && item.operation !== "IMAGE") continue;
    const capabilities = parseCatalogRecord(
      item.capabilityJson,
      item.code,
      "capabilityJson",
    );
    const parameterSchema = parseCatalogRecord(
      item.parameterSchemaJson,
      item.code,
      "parameterSchemaJson",
    );
    const properties = optionalRecord(parameterSchema.properties);
    const durationProperty = optionalRecord(properties.duration);
    const secondsProperty = optionalRecord(properties.seconds);
    const referenceLimits = optionalRecord(capabilities.referenceLimits);
    const referenceImagesProperty = optionalRecord(properties.reference_images);
    const referenceVideosProperty = optionalRecord(properties.reference_videos);
    const referenceAudiosProperty = optionalRecord(properties.reference_audios);
    const referencesProperty = optionalRecord(properties.references);
    const projected: CommercialModelCapabilitySnapshot = {
      modelId: item.code,
    };
    const extraParameterNames = projectedExtraParameterNames(properties);
    if (extraParameterNames.length) {
      projected.extraParameterNames = extraParameterNames;
    }
    if (item.operation === "IMAGE") {
      const imagePromptProfile = optionalText(capabilities.imagePromptProfile);
      if (imagePromptProfile) projected.imagePromptProfile = imagePromptProfile;
    }
    if (item.operation !== "VIDEO") {
      if (Object.keys(projected).length > 1) target.set(item.code, projected);
      continue;
    }
    const videoWorkflow = optionalText(capabilities.videoWorkflow);
    if (
      videoWorkflow === "standard" ||
      videoWorkflow === "advanced-reference" ||
      videoWorkflow === "reference"
    ) {
      projected.videoWorkflow = videoWorkflow;
    }
    const videoRatioOptions = projectedVideoRatioOptions(
      capabilities,
      properties,
    );
    if (videoRatioOptions.length) {
      projected.videoRatioOptions = videoRatioOptions;
    }
    const videoResolutionOptions = projectedVideoResolutionOptions(
      capabilities,
      properties,
    );
    if (videoResolutionOptions.length) {
      projected.videoResolutionOptions = videoResolutionOptions;
    }
    const videoSizeOptions = projectedVideoSizeOptions(capabilities, properties);
    if (videoSizeOptions.length) {
      projected.videoSizeOptions = videoSizeOptions;
    }
    const videoResolutionMaxSeconds = positiveNumberRecord(
      capabilities.videoResolutionMaxSeconds,
    );
    if (videoResolutionMaxSeconds) {
      projected.videoResolutionMaxSeconds = videoResolutionMaxSeconds;
    }
    const supportsGenerateAudio = declaredBoolean(
      capabilities.supportsGenerateAudio,
      capabilities.generateAudio,
      capabilities.nativeAudio,
      properties.generate_audio || properties.generateAudio
        ? true
        : undefined,
    );
    if (supportsGenerateAudio !== undefined) {
      projected.videoSupportsGenerateAudio = supportsGenerateAudio;
    }
    const supportsHumanReview = declaredBoolean(
      capabilities.supportsHumanReview,
      capabilities.humanReview,
      properties.human_review || properties.humanReview ? true : undefined,
    );
    if (supportsHumanReview !== undefined) {
      projected.videoSupportsHumanReview = supportsHumanReview;
    }
    const dialogueOnly = declaredBoolean(capabilities.dialogueOnly);
    if (dialogueOnly !== undefined) {
      projected.videoDialogueOnly = dialogueOnly;
    }
    const videoExtraParameterNames = projectedVideoExtraParameterNames(properties);
    if (videoExtraParameterNames.length) {
      projected.videoExtraParameterNames = videoExtraParameterNames;
    }
    const sceneOptimizeProperty = optionalRecord(properties.scene_optimize);
    const sceneOptimizeCamelProperty = optionalRecord(properties.sceneOptimize);
    const sceneOptimizeOptions = Array.from(
      new Set(
        [
          capabilities.sceneOptimizeOptions,
          capabilities.sceneOptimizations,
          sceneOptimizeProperty.enum,
          sceneOptimizeCamelProperty.enum,
        ].flatMap(stringArray),
      ),
    );
    if (sceneOptimizeOptions.length) {
      projected.videoSceneOptimizeOptions = sceneOptimizeOptions;
    }
    const generationMinimum = positiveNumber(
      capabilities.minDuration,
      capabilities.minSeconds,
      durationProperty.minimum,
      secondsProperty.minimum,
    );
    const generationMaximum = positiveNumber(
      capabilities.maxDuration,
      capabilities.maxSeconds,
      durationProperty.maximum,
      secondsProperty.maximum,
    );
    if (generationMinimum !== undefined) {
      projected.videoGenerationMinSeconds = generationMinimum;
    }
    if (generationMaximum !== undefined) {
      projected.videoGenerationMaxSeconds = generationMaximum;
    }
    const durationOptions = Array.from(
      new Set(
        [
          capabilities.durationOptions,
          capabilities.secondsOptions,
          durationProperty.enum,
          secondsProperty.enum,
        ].flatMap(positiveNumberArray),
      ),
    );
    if (durationOptions.length) {
      projected.videoDurationOptions = durationOptions;
    }
    const maxReferenceImages = firstNonNegativeInteger(
      capabilities.maxReferenceImages,
      capabilities.referenceImageMax,
      referenceLimits.images,
      referenceImagesProperty.maxItems,
    );
    const maxReferenceVideos = firstNonNegativeInteger(
      capabilities.maxReferenceVideos,
      capabilities.referenceVideoMax,
      referenceLimits.videos,
      referenceVideosProperty.maxItems,
    );
    const maxReferenceAudios = firstNonNegativeInteger(
      capabilities.maxReferenceAudios,
      capabilities.referenceAudioMax,
      referenceLimits.audios,
      referenceAudiosProperty.maxItems,
    );
    const maxReferenceTotal = firstNonNegativeInteger(
      capabilities.maxReferenceTotal,
      referenceLimits.total,
      referencesProperty.maxItems,
    );
    if (maxReferenceImages !== undefined) {
      projected.maxReferenceImages = maxReferenceImages;
    }
    if (maxReferenceVideos !== undefined) {
      projected.maxReferenceVideos = maxReferenceVideos;
    }
    if (maxReferenceAudios !== undefined) {
      projected.maxReferenceAudios = maxReferenceAudios;
    }
    if (maxReferenceTotal !== undefined) {
      projected.maxReferenceTotal = maxReferenceTotal;
    }
    for (const [field, sourceFields] of REFERENCE_DURATION_CAPABILITY_FIELDS) {
      const value = positiveNumber(
        ...sourceFields.map((sourceField) => capabilities[sourceField]),
      );
      if (value !== undefined) {
        projected[field] = value;
      }
    }
    if (Object.keys(projected).length > 1) {
      target.set(item.code, projected);
    }
  }
}

const CLOUD_ROLES_BY_OPERATION: Readonly<
  Record<string, readonly ByokModelRole[]>
> = {
  TEXT: ["TEXT"],
  IMAGE: ["IMAGE_GENERATION", "IMAGE_EDIT"],
  VIDEO: [
    "VIDEO_TEXT_TO_VIDEO",
    "VIDEO_IMAGE_TO_VIDEO",
    "VIDEO_FIRST_LAST_FRAME",
    "VIDEO_IMAGE_REFERENCE",
    "VIDEO_ALL_REFERENCE",
    "VIDEO_EDIT",
  ],
  AUDIO: ["AUDIO_SPEECH", "AUDIO_VOICE_CLONE", "AUDIO_MUSIC"],
  AUDIO_VOICE_CLONE: ["AUDIO_SPEECH", "AUDIO_VOICE_CLONE"],
  AUDIO_VOICE_DESIGN: ["AUDIO_VOICE_DESIGN"],
  AUDIO_MUSIC: ["AUDIO_MUSIC"],
  EMBEDDING: ["EMBEDDING"],
};

const CLOUD_ROLE_MODES: Readonly<
  Partial<Record<ByokModelRole, readonly string[]>>
> = {
  IMAGE_GENERATION: ["TEXT_TO_IMAGE", "IMAGE_GENERATION"],
  IMAGE_EDIT: ["IMAGE_TO_IMAGE", "IMAGE_EDIT", "EDIT"],
  VIDEO_TEXT_TO_VIDEO: ["TEXT_TO_VIDEO"],
  VIDEO_IMAGE_TO_VIDEO: ["FIRST_FRAME", "IMAGE_TO_VIDEO"],
  VIDEO_FIRST_LAST_FRAME: ["FIRST_LAST_FRAME", "MULTIMODAL_REFERENCE"],
  VIDEO_IMAGE_REFERENCE: [
    "IMAGE_REFERENCE",
    "REFERENCE_IMAGE",
    "MULTIMODAL_REFERENCE",
  ],
  VIDEO_ALL_REFERENCE: ["ALL_REFERENCE", "MULTIMODAL_REFERENCE"],
  VIDEO_EDIT: ["VIDEO_EDIT", "EDIT", "VIDEO_TO_VIDEO", "REMIX"],
  AUDIO_SPEECH: ["SPEECH", "TEXT_TO_SPEECH", "SPEECH_SYNTHESIS"],
  AUDIO_VOICE_CLONE: ["VOICE_CLONE"],
  AUDIO_VOICE_DESIGN: ["VOICE_DESIGN"],
  AUDIO_MUSIC: ["MUSIC", "TEXT_TO_MUSIC", "MUSIC_GENERATION"],
};

export function updateCloudModelAssignments(
  current: readonly ByokModelAssignment[],
  catalog: ReturnType<typeof projectCommercialModelCatalog> | null,
  requestedOperation?: string,
): ByokModelAssignment[] {
  const operations = new Set(
    (catalog?.items ?? []).map((item) => item.operation.trim().toUpperCase()),
  );
  const normalizedRequestedOperation = requestedOperation?.trim().toUpperCase();
  if (normalizedRequestedOperation) operations.add(normalizedRequestedOperation);
  if (operations.size === 0) return [...current];

  const replacedRoles = new Set<ByokModelRole>();
  for (const operation of operations) {
    for (const role of CLOUD_ROLES_BY_OPERATION[operation] ?? []) {
      replacedRoles.add(role);
    }
  }
  const next = current.filter((item) => !replacedRoles.has(item.role));
  if (!catalog) return next;

  for (const role of replacedRoles) {
    const candidates = catalog.items.filter((item) =>
      catalogItemSupportsRole(item, role),
    );
    const currentSelection = current.find(
      (item) =>
        item.role === role &&
        candidates.some((candidate) => candidate.code === item.modelId),
    );
    const defaults = candidates.filter((item) => item.isDefault === true);
    const selected =
      currentSelection
        ? candidates.find((item) => item.code === currentSelection.modelId) ?? null
        : defaults.length === 1
        ? defaults[0]
        : defaults.length === 0 && candidates.length === 1
          ? candidates[0]
          : null;
    if (selected) {
      next.push({
        modelId: selected.code,
        role,
        priority: currentSelection?.priority ?? 100,
        enabled: currentSelection?.enabled ?? true,
        ...catalogModelRuntimeMetadata(selected),
        ...(currentSelection?.runtimeOverrides
          ? { runtimeOverrides: currentSelection.runtimeOverrides }
          : {}),
      });
    }
  }
  return next.sort(
    (left, right) =>
      BYOK_MODEL_ROLES.indexOf(left.role) - BYOK_MODEL_ROLES.indexOf(right.role),
  );
}

export function updateExplicitCloudModelAssignments(
  current: readonly ByokModelAssignment[],
  catalog: ReturnType<typeof projectCommercialModelCatalog> | null,
  requestedOperation?: string,
): ByokModelAssignment[] {
  const operations = new Set(
    (catalog?.items ?? []).map((item) => item.operation.trim().toUpperCase()),
  );
  const normalizedRequestedOperation = requestedOperation?.trim().toUpperCase();
  if (normalizedRequestedOperation) operations.add(normalizedRequestedOperation);
  if (operations.size === 0) return [...current];

  const replacedRoles = new Set<ByokModelRole>();
  for (const operation of operations) {
    for (const role of CLOUD_ROLES_BY_OPERATION[operation] ?? []) {
      replacedRoles.add(role);
    }
  }
  const next = current.filter((item) => !replacedRoles.has(item.role));
  if (!catalog) return next;

  const seen = new Set(next.map((item) => `${item.role}\u0000${item.modelId}`));
  for (const role of replacedRoles) {
    for (const item of catalog.items) {
      if (!catalogItemSupportsRole(item, role)) continue;
      const key = `${role}\u0000${item.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      next.push({
        modelId: item.code,
        role,
        priority: 100,
        enabled: true,
        ...catalogModelRuntimeMetadata(item),
      });
    }
  }
  return next.sort(
    (left, right) =>
      BYOK_MODEL_ROLES.indexOf(left.role) - BYOK_MODEL_ROLES.indexOf(right.role) ||
      left.modelId.localeCompare(right.modelId),
  );
}

export function mergeModelCatalogs(
  cloud: ReturnType<typeof projectCommercialModelCatalog> | null,
  byok?: Awaited<ReturnType<typeof fetchByokModelCatalog>>,
): ReturnType<typeof projectCommercialModelCatalog> {
  if (!cloud) {
    return byok ?? { catalogVersion: "active-empty", items: [] };
  }
  const items = cloud.items.map((item) => ({
    ...item,
    capabilityJson: withRouteSelector(
      item.capabilityJson,
      `cloud:${item.code}`,
    ),
  }));
  const seen = new Set(items.map((item) => String(item.id)));
  for (const item of byok?.items ?? []) {
    if (!seen.has(String(item.id))) items.push(item);
  }
  return {
    catalogVersion: byok
      ? `${cloud.catalogVersion}+${byok.catalogVersion}`
      : cloud.catalogVersion,
    items,
  };
}

function withRouteSelector(
  capabilityJson: string | undefined,
  routeSelector: string,
): string {
  let capabilities: Record<string, unknown> = {};
  if (capabilityJson) {
    try {
      capabilities = optionalRecord(JSON.parse(capabilityJson));
    } catch {
      throw new CommercialApiError("云端模型 capabilityJson 不是有效 JSON");
    }
  }
  return JSON.stringify({ ...capabilities, routeSelector });
}

function catalogItemSupportsRole(
  item: ReturnType<typeof projectCommercialModelCatalog>["items"][number],
  role: ByokModelRole,
): boolean {
  const operation = item.operation.trim().toUpperCase();
  if (!(CLOUD_ROLES_BY_OPERATION[operation] ?? []).includes(role)) return false;
  const roleModes = CLOUD_ROLE_MODES[role];
  if (!roleModes) return true;

  const modes = catalogItemModes(item.capabilityJson);
  if (modes.length > 0) {
    return roleModes.some((mode) => modes.includes(mode));
  }
  return role === "IMAGE_GENERATION" || role === "VIDEO_TEXT_TO_VIDEO";
}

function catalogItemModes(capabilityJson: string | undefined): string[] {
  if (!capabilityJson) return [];
  let value: unknown;
  try {
    value = JSON.parse(capabilityJson);
  } catch {
    return [];
  }
  const capabilities = optionalRecord(value);
  const rawModes =
    capabilities.supportedModes ?? capabilities.audioModes ?? capabilities.modes;
  if (!Array.isArray(rawModes)) return [];
  return rawModes
    .filter((mode): mode is string => typeof mode === "string")
    .map(normalizeCommercialModelMode)
    .filter(Boolean);
}

export function authorizationAllowsByok(
  authorization: CommercialAuthorizationSnapshot | null,
): boolean {
  return authorization?.capabilities.allowsCustomModels === true;
}

export function rendererModelAccessStatus(
  status: CommercialModelAccessStatus,
  allowsCustomModels: boolean,
  gatewayOrigin: string,
  cloudModelAssignments: readonly ByokModelAssignment[],
) {
  if (allowsCustomModels) {
    return {
      ...status,
      cloudModelAssignments: [...cloudModelAssignments],
      allowsCustomModels: true,
      gatewayOrigin,
    };
  }
  return {
    ...status,
    mode: "mixed" as const,
    cloudModelAssignments: [...cloudModelAssignments],
    byokConfigured: false,
    byokProviders: [],
    allowsCustomModels: false,
    gatewayOrigin,
  };
}

export function verifyAuthorizationLease(
  raw: unknown,
  authorization: CommercialAuthorizationSnapshot,
  options: CommercialLeaseVerificationOptions,
): CommercialAuthorizationSnapshot {
  if (!authorization.lease) return authorization;
  if (!options.leaseSigningKeys) return authorization;
  const root = optionalRecord(raw);
  const lease = optionalRecord(root.lease);
  const result = verifyOfflineLease(
    lease as Parameters<typeof verifyOfflineLease>[0],
    {
      publicKeys: options.leaseSigningKeys,
      ...(options.devicePublicKeyHash === undefined
        ? {}
        : { devicePublicKeyHash: options.devicePublicKeyHash }),
      ...(authorization.license?.id === undefined
        ? {}
        : { licenseId: authorization.license.id }),
    },
  );
  return result.verified
    ? {
        ...authorization,
        lease: { ...authorization.lease, verifiedOffline: true },
      }
    : authorization;
}

export function parseLoginInput(value: unknown): CommercialLoginInput {
  const input = requiredRecord(value, "login");
  const rememberMe = input.rememberMe;
  if (rememberMe !== undefined && typeof rememberMe !== "boolean") {
    throw new CommercialApiError("rememberMe 必须是布尔值");
  }
  const captchaKey = optionalText(input.captchaKey);
  const captchaCode = optionalText(input.captchaCode);
  return {
    tenantCode: requiredText(input.tenantCode, "tenantCode"),
    username: requiredText(input.username, "username"),
    password: requiredRawText(input.password, "password"),
    ...(rememberMe === undefined ? {} : { rememberMe }),
    ...(captchaKey ? { captchaKey } : {}),
    ...(captchaCode ? { captchaCode } : {}),
  };
}

export function parseRememberedLoginInput(
  value: unknown,
): CommercialRememberedLoginInput {
  const input = requiredRecord(value, "remembered login");
  const rememberMe = input.rememberMe;
  if (rememberMe !== undefined && typeof rememberMe !== "boolean") {
    throw new CommercialApiError("rememberMe 必须是布尔值");
  }
  const captchaKey = optionalText(input.captchaKey);
  const captchaCode = optionalText(input.captchaCode);
  return {
    ...(rememberMe === undefined ? {} : { rememberMe }),
    ...(captchaKey ? { captchaKey } : {}),
    ...(captchaCode ? { captchaCode } : {}),
  };
}

export function parseRegistrationInput(value: unknown): CommercialRegistrationInput {
  const input = requiredRecord(value, "registration");
  const nickname = optionalText(input.nickname);
  const email = optionalText(input.email);
  const captchaKey = optionalText(input.captchaKey);
  const captchaCode = optionalText(input.captchaCode);
  return {
    tenantCode: requiredText(input.tenantCode, "tenantCode"),
    username: requiredText(input.username, "username"),
    password: requiredRawText(input.password, "password"),
    ...(nickname ? { nickname } : {}),
    ...(email ? { email } : {}),
    ...(captchaKey ? { captchaKey } : {}),
    ...(captchaCode ? { captchaCode } : {}),
  };
}

export function parseProfileUpdateInput(value: unknown): CommercialProfileUpdateInput {
  const input = requiredRecord(value, "profile update");
  const gender = requiredInteger(input.gender, "gender");
  if (gender !== 0 && gender !== 1 && gender !== 2) {
    throw new CommercialApiError("gender 只能为 0、1 或 2");
  }
  return {
    nickname: textField(input.nickname, "nickname"),
    email: textField(input.email, "email"),
    phone: textField(input.phone, "phone"),
    gender,
    profileDescription: textField(
      input.profileDescription,
      "profileDescription",
    ),
  };
}

function textField(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new CommercialApiError(`${name} 必须是字符串`);
  }
  return value;
}

export function requiredBytes(value: unknown, name: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new CommercialApiError(`${name} 必须是字节数组`);
}

export function parseBootstrapQuery(value: unknown): CommercialBootstrapQuery {
  const input = optionalRecord(value);
  const modelOperation = optionalText(input.modelOperation);
  const catalogVersion = optionalText(input.catalogVersion);
  const currentVersion = optionalText(input.currentVersion);
  const target = optionalText(input.target);
  const arch = optionalText(input.arch);
  return {
    ...(modelOperation ? { modelOperation } : {}),
    ...(catalogVersion ? { catalogVersion } : {}),
    ...(currentVersion ? { currentVersion } : {}),
    ...(target ? { target } : {}),
    ...(arch ? { arch } : {}),
  };
}

export function parseModelCatalogQuery(value: unknown): {
  source: "active" | "cloud";
  query: CommercialModelCatalogQuery;
} {
  const input = optionalRecord(value);
  const operation = optionalText(input.operation);
  const catalogVersion = optionalText(input.catalogVersion);
  const requestedSource = optionalText(input.source)?.toLowerCase() ?? "";
  if (requestedSource && requestedSource !== "active" && requestedSource !== "cloud") {
    throw new CommercialApiError("模型目录来源无效");
  }
  return {
    source: requestedSource === "cloud" ? "cloud" : "active",
    query: {
      ...(operation ? { operation } : {}),
      ...(catalogVersion ? { catalogVersion } : {}),
    },
  };
}

export function parseInvocationQuery(value: unknown): CommercialInvocationQuery {
  const input = optionalRecord(value);
  const page = input.page === undefined ? undefined : requiredInteger(input.page, "page");
  const pageSize =
    input.pageSize === undefined
      ? undefined
      : requiredInteger(input.pageSize, "pageSize");
  if (page !== undefined && page < 1) {
    throw new CommercialApiError("page 必须大于等于 1");
  }
  if (pageSize !== undefined && (pageSize < 1 || pageSize > 100)) {
    throw new CommercialApiError("pageSize 必须是 1 到 100 之间的整数");
  }
  const status = optionalText(input.status);
  const operation = optionalText(input.operation);
  const modelSkuCode = optionalText(input.modelSkuCode);
  return {
    ...(page === undefined ? {} : { page }),
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(status ? { status } : {}),
    ...(operation ? { operation } : {}),
    ...(modelSkuCode ? { modelSkuCode } : {}),
  };
}
