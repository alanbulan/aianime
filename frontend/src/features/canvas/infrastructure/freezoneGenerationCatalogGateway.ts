// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type {
  CanvasCameraOptions,
  CanvasGenerationCatalogGateway,
  CanvasImageModel,
  CanvasImageModelProvider,
  CanvasStyleTemplate,
  CanvasVideoModel,
  CanvasVideoModelProvider,
} from "../application/generationCatalog";
import type { CameraMovementPreset } from "../domain/cameraMovementPresets";

interface StyleTemplateTransport {
  readonly id: string;
  readonly label: string;
  readonly style_prompt: string;
  readonly author?: string;
  readonly category?: string;
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

type VideoResolution = "480p" | "720p" | "1080p";

const IMAGE_MODEL_PROVIDER_HINTS: ReadonlyArray<{
  match: (raw: string) => boolean;
  providerId: CanvasImageModelProvider;
}> = [
  { match: (value) => value.toLowerCase().startsWith("huimeng"), providerId: "huimeng" },
  { match: (value) => value.toLowerCase().includes("/gemini"), providerId: "openrouter" },
  { match: (value) => value.toLowerCase().startsWith("google/"), providerId: "openrouter" },
  { match: (value) => value.toLowerCase().startsWith("anthropic/"), providerId: "openrouter" },
  { match: (value) => value.toLowerCase().startsWith("openrouter/"), providerId: "openrouter" },
  { match: (value) => value.toLowerCase().startsWith("gpt-image"), providerId: "openai" },
  { match: (value) => value.toLowerCase().startsWith("dall-e"), providerId: "openai" },
];

const VIDEO_MODEL_PROVIDER_HINTS: ReadonlyArray<{
  match: (raw: string) => boolean;
  providerId: CanvasVideoModelProvider;
}> = [
  { match: (value) => value.toLowerCase().startsWith("huimeng"), providerId: "huimeng" },
  { match: (value) => value.toLowerCase().startsWith("seedance"), providerId: "seedance" },
];

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

function pickNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function pickStringArray(
  record: Record<string, unknown>,
  ...keys: string[]
): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string =>
          typeof item === "string" && item.length > 0,
      );
    }
  }
  return [];
}

function inferImageProvider(raw: string): CanvasImageModelProvider {
  for (const hint of IMAGE_MODEL_PROVIDER_HINTS) {
    if (hint.match(raw)) return hint.providerId;
  }
  return "huimeng";
}

function normalizeImageProvider(
  raw: string | null,
): CanvasImageModelProvider | null {
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (
    lowered === "huimeng" ||
    lowered === "openrouter" ||
    lowered === "openai"
  ) {
    return lowered;
  }
  return null;
}

function imageModelFromObject(
  entry: Record<string, unknown>,
): CanvasImageModel | null {
  const apiModel = pickString(entry, "model", "apiModel", "api_model", "name");
  if (!apiModel) return null;
  const providerId =
    normalizeImageProvider(
      pickString(entry, "providerId", "provider_id", "provider"),
    ) ?? inferImageProvider(apiModel);
  return {
    id: pickString(entry, "id") ?? `${providerId}/${apiModel}`,
    providerId,
    apiModel,
    label:
      pickString(entry, "label", "displayName", "display_name") ?? apiModel,
  };
}

function imageModelFromString(raw: string): CanvasImageModel {
  const providerId = inferImageProvider(raw);
  return {
    id: `${providerId}/${raw}`,
    providerId,
    apiModel: raw,
    label: raw,
  };
}

function coerceImageModels(payload: unknown): CanvasImageModel[] {
  let candidate = payload;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const wrapper = candidate as Record<string, unknown>;
    if (Array.isArray(wrapper.models)) candidate = wrapper.models;
    else if (Array.isArray(wrapper.data)) candidate = wrapper.data;
    else if (Array.isArray(wrapper.items)) candidate = wrapper.items;
    else {
      const flattened: CanvasImageModel[] = [];
      for (const [providerRaw, value] of Object.entries(wrapper)) {
        const providerId = normalizeImageProvider(providerRaw);
        if (!providerId || !Array.isArray(value)) continue;
        for (const item of value) {
          if (typeof item === "string") {
            flattened.push({
              id: `${providerId}/${item}`,
              providerId,
              apiModel: item,
              label: item,
            });
          } else if (item && typeof item === "object") {
            const model = imageModelFromObject(
              item as Record<string, unknown>,
            );
            if (model) flattened.push({ ...model, providerId });
          }
        }
      }
      if (flattened.length > 0) return flattened;
    }
  }
  if (!Array.isArray(candidate)) return [];
  const result: CanvasImageModel[] = [];
  for (const item of candidate) {
    if (typeof item === "string") result.push(imageModelFromString(item));
    else if (item && typeof item === "object") {
      const model = imageModelFromObject(item as Record<string, unknown>);
      if (model) result.push(model);
    }
  }
  return result;
}

function inferVideoProvider(raw: string): CanvasVideoModelProvider {
  for (const hint of VIDEO_MODEL_PROVIDER_HINTS) {
    if (hint.match(raw)) return hint.providerId;
  }
  return "seedance";
}

function normalizeVideoProvider(
  raw: string | null,
): CanvasVideoModelProvider | null {
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  return lowered === "seedance" || lowered === "huimeng" ? lowered : null;
}

function videoModelFromObject(
  entry: Record<string, unknown>,
): CanvasVideoModel | null {
  const apiModel = pickString(entry, "model", "apiModel", "api_model", "name");
  if (!apiModel) return null;
  const providerId =
    normalizeVideoProvider(
      pickString(entry, "providerId", "provider_id", "provider"),
    ) ?? inferVideoProvider(apiModel);
  const resolutionOptions = pickStringArray(
    entry,
    "resolutionOptions",
    "resolution_options",
  )
    .map((value) => value.toLowerCase())
    .filter(
      (value): value is VideoResolution =>
        value === "480p" || value === "720p" || value === "1080p",
    );
  const sceneOptimizeOptions = pickStringArray(
    entry,
    "sceneOptimizeOptions",
    "scene_optimize_options",
  )
    .map((value) => value.toLowerCase())
    .filter(
      (value): value is "anime" | "realistic" =>
        value === "anime" || value === "realistic",
    );
  const defaultSceneOptimizeRaw = pickString(
    entry,
    "defaultSceneOptimize",
    "default_scene_optimize",
  )?.toLowerCase();
  const defaultSceneOptimize =
    defaultSceneOptimizeRaw === "anime" ||
    defaultSceneOptimizeRaw === "realistic"
      ? defaultSceneOptimizeRaw
      : null;
  return {
    id: pickString(entry, "id") ?? apiModel,
    providerId,
    apiModel,
    label:
      pickString(entry, "label", "displayName", "display_name") ?? apiModel,
    ...(resolutionOptions.length > 0
      ? { resolutionOptions }
      : {}),
    minDuration: pickNumber(entry, "minDuration", "min_duration"),
    maxDuration: pickNumber(entry, "maxDuration", "max_duration"),
    ...(sceneOptimizeOptions.length > 0
      ? { sceneOptimizeOptions }
      : {}),
    defaultSceneOptimize,
  };
}

function videoModelFromString(raw: string): CanvasVideoModel {
  return {
    id: raw,
    providerId: inferVideoProvider(raw),
    apiModel: raw,
    label: raw,
  };
}

function coerceVideoModels(payload: unknown): CanvasVideoModel[] {
  let candidate = payload;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const wrapper = candidate as Record<string, unknown>;
    if (Array.isArray(wrapper.models)) candidate = wrapper.models;
    else if (Array.isArray(wrapper.data)) candidate = wrapper.data;
    else if (Array.isArray(wrapper.items)) candidate = wrapper.items;
    else {
      const flattened: CanvasVideoModel[] = [];
      for (const [providerRaw, value] of Object.entries(wrapper)) {
        const providerId = normalizeVideoProvider(providerRaw);
        if (!providerId || !Array.isArray(value)) continue;
        for (const item of value) {
          if (typeof item === "string") {
            flattened.push({
              id: item,
              providerId,
              apiModel: item,
              label: item,
            });
          } else if (item && typeof item === "object") {
            const model = videoModelFromObject(
              item as Record<string, unknown>,
            );
            if (model) flattened.push({ ...model, providerId });
          }
        }
      }
      if (flattened.length > 0) return flattened;
    }
  }
  if (!Array.isArray(candidate)) return [];
  const result: CanvasVideoModel[] = [];
  for (const item of candidate) {
    if (typeof item === "string") result.push(videoModelFromString(item));
    else if (item && typeof item === "object") {
      const model = videoModelFromObject(item as Record<string, unknown>);
      if (model) result.push(model);
    }
  }
  return result;
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
  };
}

export const freezoneGenerationCatalogGateway: CanvasGenerationCatalogGateway = {
  async listImageModels(projectId) {
    const payload = await apiCall<unknown>(
      `projects/${encodeURIComponent(projectId)}/freezone/image/models`,
    );
    return coerceImageModels(payload);
  },
  async listVideoModels(projectId) {
    const payload = await apiCall<unknown>(
      `projects/${encodeURIComponent(projectId)}/freezone/video/models`,
    );
    return coerceVideoModels(payload);
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
