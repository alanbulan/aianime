// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";
import {
  loadCommercialModelCatalog,
  type CommercialModelCatalog,
} from "@/modules/model_usage/public";

import type {
  CanvasCameraOptions,
  CanvasGenerationCatalogGateway,
  CanvasImageModel,
  CanvasStyleTemplate,
  CanvasVideoModel,
} from "../application/generationCatalog";
import type { CameraMovementPreset } from "../domain/cameraMovementPresets";
import type { CanvasImageMode } from "../domain/imageModelCapability";
import type { VideoGenMode } from "../domain/videoGenerationMode";

interface StyleTemplateTransport {
  readonly id: string;
  readonly label: string;
  readonly style_prompt: string;
  readonly author?: string;
  readonly category?: string;
  readonly cover_url?: string;
  readonly sample_urls?: string[];
}

interface CameraIdLabelTransport {
  readonly id: string;
  readonly label: string;
}

interface CameraOptionsTransport {
  readonly camera_bodies: CameraIdLabelTransport[];
  readonly lenses: CameraIdLabelTransport[];
  readonly focal_lengths_mm: number[];
  readonly apertures: string[];
}

function pickString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export function commercialImageModels(
  catalog: CommercialModelCatalog,
): CanvasImageModel[] {
  return catalog.items.map((item) => {
    const imageModes = normalizeImageModes(
      item.capabilities.supportedModes ??
        item.capabilities.imageModes ??
        item.capabilities.modes,
    );
    const routeSelector = pickString(item.capabilities, "routeSelector");
    return {
      id: routeSelector ?? item.code,
      apiModel: item.code,
      ...(routeSelector ? { routeSelector } : {}),
      label: item.displayName,
      ...(imageModes.length > 0 ? { imageModes } : {}),
      capabilities: item.capabilities,
      parameterSchema: item.parameterSchema,
    };
  });
}

export function commercialVideoModels(
  catalog: CommercialModelCatalog,
): CanvasVideoModel[] {
  return catalog.items.map((item) => {
    const properties = schemaProperties(item.parameterSchema);
    const capabilities = item.capabilities;
    const routeSelector = pickString(capabilities, "routeSelector");
    const referenceLimits = optionalRecord(capabilities.referenceLimits);
    const resolutionOptions = stringArray(
      capabilities.resolutionOptions ??
        capabilities.resolutions ??
        properties.resolution?.enum,
    );
    const aspectRatioOptions = stringArray(
      capabilities.aspectRatioOptions ??
        capabilities.ratioOptions ??
        capabilities.aspectRatios ??
        properties.aspect_ratio?.enum ??
        properties.aspectRatio?.enum,
    );
    const supportedModes = videoModes(
      capabilities.supportedModes ??
        capabilities.generationModes ??
        capabilities.modes,
    );
    const sceneOptimizeOptions = sceneOptimizeValues(
      capabilities.sceneOptimizeOptions ??
        capabilities.sceneOptimizations ??
        properties.scene_optimize?.enum ??
        properties.sceneOptimize?.enum,
    );
    const defaultSceneOptimize = sceneOptimizeValue(
      capabilities.defaultSceneOptimize ??
        properties.scene_optimize?.default ??
        properties.sceneOptimize?.default,
    );
    return {
      id: routeSelector ?? item.code,
      apiModel: item.code,
      ...(routeSelector ? { routeSelector } : {}),
      label: item.displayName,
      parameterSchema: item.parameterSchema,
      ...(supportedModes.length > 0 ? { supportedModes } : {}),
      ...optionalBooleanField(
        "supportsHumanReview",
        capabilities.supportsHumanReview ?? capabilities.humanReview,
        properties.human_review || properties.humanReview ? true : undefined,
      ),
      ...optionalBooleanField(
        "supportsReferenceImages",
        capabilities.supportsReferenceImages,
      ),
      ...optionalBooleanField(
        "supportsReferenceVideos",
        capabilities.supportsReferenceVideos,
      ),
      ...optionalBooleanField(
        "supportsReferenceAudios",
        capabilities.supportsReferenceAudios,
      ),
      ...optionalNumberField(
        "maxReferenceImages",
        capabilities.maxReferenceImages ??
          capabilities.referenceImageMax ??
          referenceLimits?.images ??
          properties.reference_images?.maxItems,
      ),
      ...optionalNumberField(
        "maxReferenceVideos",
        capabilities.maxReferenceVideos ??
          capabilities.referenceVideoMax ??
          referenceLimits?.videos ??
          properties.reference_videos?.maxItems,
      ),
      ...optionalNumberField(
        "maxReferenceAudios",
        capabilities.maxReferenceAudios ??
          capabilities.referenceAudioMax ??
          referenceLimits?.audios ??
          properties.reference_audios?.maxItems,
      ),
      ...optionalNumberField(
        "maxReferenceTotal",
        capabilities.maxReferenceTotal ??
          referenceLimits?.total ??
          properties.references?.maxItems,
      ),
      ...optionalNumberField(
        "referenceAudioMinSeconds",
        capabilities.referenceAudioMinSeconds,
      ),
      ...optionalNumberField(
        "referenceAudioMaxSeconds",
        capabilities.referenceAudioMaxSeconds,
      ),
      ...optionalNumberField(
        "referenceAudioTotalMinSeconds",
        capabilities.referenceAudioTotalMinSeconds,
      ),
      ...optionalNumberField(
        "referenceAudioTotalMaxSeconds",
        capabilities.referenceAudioTotalMaxSeconds ??
          capabilities.maxReferenceAudioDurationSeconds ??
          referenceLimits?.audioDurationSeconds,
      ),
      ...optionalNumberField(
        "referenceVideoMinSeconds",
        capabilities.referenceVideoMinSeconds,
      ),
      ...optionalNumberField(
        "referenceVideoMaxSeconds",
        capabilities.referenceVideoMaxSeconds,
      ),
      ...optionalNumberField(
        "referenceVideoTotalMinSeconds",
        capabilities.referenceVideoTotalMinSeconds,
      ),
      ...optionalNumberField(
        "referenceVideoTotalMaxSeconds",
        capabilities.referenceVideoTotalMaxSeconds,
      ),
      ...(resolutionOptions.length > 0 ? { resolutionOptions } : {}),
      ...(aspectRatioOptions.length > 0 ? { aspectRatioOptions } : {}),
      minDuration: finiteNumber(
        capabilities.minDuration ??
          capabilities.minSeconds ??
          properties.duration?.minimum ??
          properties.seconds?.minimum,
      ),
      maxDuration: finiteNumber(
        capabilities.maxDuration ??
          capabilities.maxSeconds ??
          properties.duration?.maximum ??
          properties.seconds?.maximum,
      ),
      ...(sceneOptimizeOptions.length > 0 ? { sceneOptimizeOptions } : {}),
      ...(defaultSceneOptimize ? { defaultSceneOptimize } : {}),
    };
  });
}

const VIDEO_MODE_BY_TOKEN: Record<string, VideoGenMode> = {
  texttovideo: "textToVideo",
  text2video: "textToVideo",
  allreference: "allReference",
  omnireference: "allReference",
  imagetovideo: "imageToVideo",
  image2video: "imageToVideo",
  firstframe: "firstFrame",
  firstlastframe: "firstLastFrame",
  keyframes: "firstLastFrame",
  imagereference: "imageReference",
  videoedit: "videoEdit",
};

const IMAGE_MODE_BY_TOKEN: Record<string, CanvasImageMode> = {
  texttoimage: "generation",
  imagegeneration: "generation",
  generate: "generation",
  imageedit: "edit",
  edit: "edit",
};

function normalizeImageModes(value: unknown): CanvasImageMode[] {
  const modes = stringArray(value).flatMap((item) => {
    const mode = IMAGE_MODE_BY_TOKEN[item.replace(/[\s_-]/g, "").toLowerCase()];
    return mode ? [mode] : [];
  });
  return Array.from(new Set(modes));
}

function videoModes(value: unknown): VideoGenMode[] {
  const modes = stringArray(value).flatMap((item) => {
    const mode = VIDEO_MODE_BY_TOKEN[item.replace(/[\s_-]/g, "").toLowerCase()];
    return mode ? [mode] : [];
  });
  return Array.from(new Set(modes));
}

function sceneOptimizeValues(
  value: unknown,
): Array<"anime" | "realistic"> {
  return stringArray(value).flatMap((item) => {
    const normalized = item.trim().toLowerCase();
    return normalized === "anime" || normalized === "realistic"
      ? [normalized]
      : [];
  });
}

function sceneOptimizeValue(value: unknown): "anime" | "realistic" | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "anime" || normalized === "realistic"
    ? normalized
    : null;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalBooleanField<K extends string>(
  key: K,
  value: unknown,
  fallback?: boolean,
): Partial<Record<K, boolean>> {
  const resolved = typeof value === "boolean" ? value : fallback;
  return resolved === undefined ? {} : ({ [key]: resolved } as Record<K, boolean>);
}

function optionalNumberField<K extends string>(
  key: K,
  value: unknown,
): Partial<Record<K, number>> {
  const resolved = finiteNumber(value);
  return resolved === null || resolved < 0
    ? {}
    : ({ [key]: resolved } as Record<K, number>);
}

function schemaProperties(
  schema: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const properties = schema.properties;
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
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coerceCameraTemplates(payload: unknown): CameraMovementPreset[] {
  let candidate = payload;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const wrapper = candidate as Record<string, unknown>;
    if (Array.isArray(wrapper.templates)) candidate = wrapper.templates;
    else if (Array.isArray(wrapper.data)) candidate = wrapper.data;
    else if (Array.isArray(wrapper.items)) candidate = wrapper.items;
    else if (Array.isArray(wrapper.camera_templates)) {
      candidate = wrapper.camera_templates;
    }
  }
  if (!Array.isArray(candidate)) return [];
  const result: CameraMovementPreset[] = [];
  for (const item of candidate) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const id = pickString(
      entry,
      "id",
      "template_id",
      "templateId",
      "name",
      "key",
    );
    if (!id) continue;
    const label =
      pickString(
        entry,
        "label",
        "display_name",
        "displayName",
        "title",
        "name",
      ) ?? id;
    const promptFragment =
      pickString(
        entry,
        "promptFragment",
        "prompt_fragment",
        "prompt",
        "fragment",
        "description",
      ) ?? label;
    const videoUrl = pickString(
      entry,
      "videoUrl",
      "video_url",
      "previewUrl",
      "preview_url",
      "thumbnail",
      "thumbnail_url",
    );
    result.push({ id, label, promptFragment, videoUrl });
  }
  return result;
}

function mapCameraOptions(options: CameraOptionsTransport): CanvasCameraOptions {
  return {
    cameraBodies: options.camera_bodies,
    lenses: options.lenses,
    focalLengthsMm: options.focal_lengths_mm,
    apertures: options.apertures,
  };
}

function mapStyleTemplate(
  template: StyleTemplateTransport,
): CanvasStyleTemplate {
  return {
    id: template.id,
    label: template.label,
    stylePrompt: template.style_prompt,
    ...(template.author !== undefined ? { author: template.author } : {}),
    ...(template.category !== undefined
      ? { category: template.category }
      : {}),
    ...(template.cover_url !== undefined
      ? { coverUrl: template.cover_url }
      : {}),
    ...(template.sample_urls !== undefined
      ? { sampleUrls: template.sample_urls }
      : {}),
  };
}

export const httpCanvasGenerationCatalogGateway: CanvasGenerationCatalogGateway = {
  async listImageModels(_projectId) {
    if (!window.aiAnimeDesktop?.commercial) return [];
    return commercialImageModels(await loadCommercialModelCatalog("IMAGE"));
  },
  async listVideoModels(_projectId) {
    if (!window.aiAnimeDesktop?.commercial) return [];
    return commercialVideoModels(await loadCommercialModelCatalog("VIDEO"));
  },
  async getCameraOptions(projectId) {
    const options = await apiCall<CameraOptionsTransport>(
      `projects/${encodeURIComponent(projectId)}/freezone/image/camera-options`,
    );
    return mapCameraOptions(options);
  },
  async listStyleTemplates(projectId) {
    const templates = await apiCall<StyleTemplateTransport[]>(
      `projects/${encodeURIComponent(projectId)}/freezone/image/style-templates`,
    );
    return templates.map(mapStyleTemplate);
  },
  async listVideoCameraTemplates(projectId) {
    const payload = await apiCall<unknown>(
      `projects/${encodeURIComponent(projectId)}/freezone/video/camera-templates`,
    );
    return coerceCameraTemplates(payload);
  },
};
