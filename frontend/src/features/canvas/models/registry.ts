// Copyright (c) 2026 AI anime
import type {
  ExtraParamDefinition,
  ImageModelDefinition,
  ImageModelRuntimeContext,
  ResolutionOption,
} from './types';
import {
  filterCanvasImageModels,
  type CanvasImageMode,
} from '@/modules/creative_canvas/public';

interface CatalogImageModel {
  readonly id: string;
  readonly apiModel: string;
  readonly label: string;
  readonly imageModes?: ReadonlyArray<CanvasImageMode>;
  readonly capabilities?: Record<string, unknown>;
  readonly parameterSchema?: Record<string, unknown>;
}

const DEFAULT_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
] as const;
const DEFAULT_RESOLUTIONS = ['1K', '2K', '4K'] as const;
const NON_EXTRA_PARAMETER_KEYS = new Set([
  'model',
  'prompt',
  'image',
  'images',
  'mask',
  'reference',
  'reference_image',
  'reference_images',
  'aspect_ratio',
  'aspectRatio',
  'image_size',
  'imageSize',
  'resolution',
  'size',
  'width',
  'height',
  'n',
  'output_format',
  'response_format',
]);

export function imageModelDefinitions(
  models: readonly CatalogImageModel[],
  mode?: CanvasImageMode,
): ImageModelDefinition[] {
  return (mode ? filterCanvasImageModels(models, mode) : models).map(
    toImageModelDefinition,
  );
}

export function selectImageModel(
  models: readonly ImageModelDefinition[],
  persistedModelId: string | null | undefined,
): ImageModelDefinition | undefined {
  const persisted = persistedModelId?.trim();
  return (
    (persisted
      ? models.find(
          (model) => model.id === persisted || model.resolveRequest({ referenceImageCount: 0 }).requestModel === persisted,
        )
      : undefined) ?? models[0]
  );
}

export function resolveImageModelResolutions(
  model: ImageModelDefinition,
  context: ImageModelRuntimeContext = {},
): ResolutionOption[] {
  const resolvedOptions = model.resolveResolutions?.(context);
  return resolvedOptions && resolvedOptions.length > 0
    ? resolvedOptions
    : model.resolutions;
}

export function resolveImageModelResolution(
  model: ImageModelDefinition,
  requestedResolution: string | undefined,
  context: ImageModelRuntimeContext = {},
): ResolutionOption {
  const resolutionOptions = resolveImageModelResolutions(model, context);
  return (
    (requestedResolution
      ? resolutionOptions.find((item) => item.value === requestedResolution)
      : undefined) ??
    resolutionOptions.find((item) => item.value === model.defaultResolution) ??
    resolutionOptions[0] ?? {
      value: model.defaultResolution,
      label: model.defaultResolution,
    }
  );
}

function toImageModelDefinition(model: CatalogImageModel): ImageModelDefinition {
  const capabilities = model.capabilities ?? {};
  const properties = schemaProperties(model.parameterSchema ?? {});
  const aspectRatios = firstStringArray(
    capabilities.aspectRatios,
    capabilities.aspect_ratio_options,
    properties.aspect_ratio?.enum,
    properties.aspectRatio?.enum,
  );
  const resolutions = firstStringArray(
    capabilities.resolutionOptions,
    capabilities.resolutions,
    capabilities.imageSizes,
    capabilities.image_sizes,
    properties.image_size?.enum,
    properties.imageSize?.enum,
    properties.resolution?.enum,
    properties.size?.enum,
  );
  const normalizedAspectRatios =
    aspectRatios.length > 0 ? aspectRatios : [...DEFAULT_ASPECT_RATIOS];
  const normalizedResolutions =
    resolutions.length > 0 ? resolutions : [...DEFAULT_RESOLUTIONS];
  const extraParamsSchema = extraParameterSchema(properties);
  const defaultExtraParams = Object.fromEntries(
    extraParamsSchema.flatMap((definition) =>
      definition.defaultValue === undefined
        ? []
        : [[definition.key, definition.defaultValue]],
    ),
  );
  const expectedDurationMs = finiteNumber(
    capabilities.expectedDurationMs,
  ) ?? secondsToMilliseconds(
    capabilities.expectedDurationSeconds ?? capabilities.etaSeconds,
  );
  const defaultAspectRatio =
    firstString(
      capabilities.defaultAspectRatio,
      properties.aspect_ratio?.default,
      properties.aspectRatio?.default,
    ) ?? normalizedAspectRatios[0] ?? '1:1';
  const defaultResolution =
    firstString(
      capabilities.defaultResolution,
      capabilities.defaultImageSize,
      properties.image_size?.default,
      properties.imageSize?.default,
      properties.resolution?.default,
      properties.size?.default,
    ) ?? normalizedResolutions[0] ?? '2K';

  return {
    id: model.id,
    mediaType: 'image',
    displayName: model.label,
    description: firstString(capabilities.description) ?? '',
    eta: expectedDurationMs ? `${Math.round(expectedDurationMs / 1000)}s` : '',
    ...(expectedDurationMs ? { expectedDurationMs } : {}),
    defaultAspectRatio,
    defaultResolution,
    aspectRatios: normalizedAspectRatios.map((value) => ({ value, label: value })),
    resolutions: normalizedResolutions.map((value) => ({ value, label: value })),
    ...(extraParamsSchema.length > 0 ? { extraParamsSchema } : {}),
    ...(Object.keys(defaultExtraParams).length > 0 ? { defaultExtraParams } : {}),
    resolveRequest: ({ referenceImageCount }) => ({
      requestModel: model.apiModel,
      modeLabel: referenceImageCount > 0 ? 'edit' : 'generate',
    }),
  };
}

function schemaProperties(
  schema: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const properties = schema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(properties).filter(
      (entry): entry is [string, Record<string, unknown>] =>
        Boolean(entry[1]) && typeof entry[1] === 'object' && !Array.isArray(entry[1]),
    ),
  );
}

function extraParameterSchema(
  properties: Record<string, Record<string, unknown>>,
): ExtraParamDefinition[] {
  const definitions: ExtraParamDefinition[] = [];
  for (const [key, property] of Object.entries(properties)) {
    if (NON_EXTRA_PARAMETER_KEYS.has(key)) continue;
    const enumValues = stringArray(property.enum);
    const type = firstString(property.type);
    const defaultValue = primitive(property.default);
    const description = firstString(property.description);
    const base = {
      key,
      label: firstString(property.title) ?? key,
      ...(description ? { description } : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
    };
    if (enumValues.length > 0) {
      definitions.push({
        ...base,
        type: 'enum',
        options: enumValues.map((value) => ({ value, label: value })),
      });
      continue;
    }
    if (type === 'boolean') {
      definitions.push({ ...base, type: 'boolean' });
      continue;
    }
    if (type === 'number' || type === 'integer') {
      definitions.push({
        ...base,
        type: 'number',
        ...(finiteNumber(property.minimum) !== null
          ? { min: finiteNumber(property.minimum) as number }
          : {}),
        ...(finiteNumber(property.maximum) !== null
          ? { max: finiteNumber(property.maximum) as number }
          : {}),
        ...(finiteNumber(property.multipleOf) !== null
          ? { step: finiteNumber(property.multipleOf) as number }
          : {}),
      });
      continue;
    }
    if (type === 'string') definitions.push({ ...base, type: 'string' });
  }
  return definitions;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    const result = stringArray(value);
    if (result.length > 0) return result;
  }
  return [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      )
    : [];
}

function primitive(value: unknown): boolean | number | string | undefined {
  return typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    typeof value === 'string'
    ? value
    : undefined;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function secondsToMilliseconds(value: unknown): number | null {
  const seconds = finiteNumber(value);
  return seconds !== null && seconds > 0 ? seconds * 1000 : null;
}
