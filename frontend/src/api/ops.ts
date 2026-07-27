// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";
import type { CameraMovementPreset } from "@/features/canvas/domain/cameraMovementPresets";
import {
  ensureBackendImageUrl,
  ensureBackendImageUrls,
} from "@/features/canvas/infrastructure/freezoneAssetGateway";

// Generation node context ------------------------------------------------ //

/**
 * Optional canvas/node context the backend uses to record a per-node
 * generation history entry. Generation-style endpoints accept these; omitting
 * them is harmless (the backend simply skips history recording). Mixed into
 * each generation payload via {@link FreezoneNodeContext}.
 */
export interface FreezoneNodeContext {
  /** Current canvas id, usually "default". */
  canvasId?: string | null;
  /** Id of the node that triggered the generation. */
  nodeId?: string | null;
}

/**
 * Map the camelCase node context to the backend's snake_case body fields,
 * emitting keys only when present so legacy callers stay byte-identical.
 */
function nodeContextBody(ctx: FreezoneNodeContext): Record<string, string> {
  const out: Record<string, string> = {};
  if (ctx.canvasId) out.canvas_id = ctx.canvasId;
  if (ctx.nodeId) out.node_id = ctx.nodeId;
  return out;
}

// /freezone/gen ----------------------------------------------------------- //

export type FreezoneProvider =
  | "openrouter"
  | "huimeng"
  | "openai";

export interface FreezoneJobRef {
  task_type:
    | "freezone_gen"
    | "freezone_edit"
    | "freezone_multi_view"
    | "freezone_relight"
    | "freezone_scene_360"
    | "freezone_template_edit"
    | "freezone_upscale"
    | "freezone_outpaint"
    | "freezone_redraw"
    | "freezone_video_gen"
    | "freezone_video_omni_gen"
    | "freezone_video_i2v"
    | "freezone_video_erase"
    | "freezone_video_compose"
    | "freezone_video_upscale"
    | "freezone_audio_separate"
    | "freezone_audio_speech"
    | "freezone_audio_eleven_music"
    | "freezone_image_reverse_prompt"
    | "freezone_text_translate"
    | "freezone_story_script"
    | "freezone_analyze_video_story"
    | "stage_asset";
  job_id: string;
  task_key: string;
}

// /freezone/video/gen ----------------------------------------------------- //

export type FreezoneVideoAspectRatio =
  | "auto"
  | "16:9"
  | "4:3"
  | "1:1"
  | "3:4"
  | "9:16"
  | "21:9";

export type FreezoneVideoResolution = "480p" | "720p" | "1080p";

/** Local element marker on the source image, used to anchor subjects/objects. */
export interface FreezoneVideoMark {
  label: string;
  sourceUrl?: string;
  pointX?: number | null;
  pointY?: number | null;
  boxX?: number | null;
  boxY?: number | null;
  boxWidth?: number | null;
  boxHeight?: number | null;
  note?: string;
}

export interface FreezoneVideoGenPayload extends FreezoneNodeContext {
  prompt: string;
  /** e.g. locked_off / follow_tracking / orbit_up */
  cameraTemplateId?: string | null;
  characterIds?: string[];
  marks?: FreezoneVideoMark[];
  aspectRatio?: FreezoneVideoAspectRatio;
  resolution?: FreezoneVideoResolution;
  /** seconds; spec only requires ≥1, the UI typically caps higher. */
  durationSeconds?: number;
  generateAudio?: boolean;
  /** Backend model id, e.g. huimeng_seedance20_fast / seedance_pro. */
  model?: string;
  /** 生成模式（还原用）：textToVideo / imageToVideo / firstLastFrame / imageReference / allReference。 */
  genMode?: string;
  /**
   * Real-person material review. Set `true` when the input contains real
   * human faces so the backend routes the job through the human-review path
   * (may take longer, approval not guaranteed). Omitted/false otherwise.
   */
  humanReview?: boolean;
  sceneOptimize?: "anime" | "realistic" | null;
}

export async function submitFreezoneVideoGen(
  project: string,
  payload: FreezoneVideoGenPayload,
): Promise<FreezoneJobRef> {
  return await apiCall<FreezoneJobRef>(
    `projects/${encodeURIComponent(project)}/freezone/video/gen`,
    {
      method: "POST",
      json: {
        prompt: payload.prompt,
        camera_template_id: payload.cameraTemplateId ?? null,
        character_ids: payload.characterIds ?? [],
        marks: (payload.marks ?? []).map((m) => ({
          label: m.label,
          source_url: m.sourceUrl ?? "",
          point_x: m.pointX ?? null,
          point_y: m.pointY ?? null,
          box_x: m.boxX ?? null,
          box_y: m.boxY ?? null,
          box_width: m.boxWidth ?? null,
          box_height: m.boxHeight ?? null,
          note: m.note ?? "",
        })),
        aspect_ratio: payload.aspectRatio ?? "16:9",
        resolution: payload.resolution ?? "720p",
        duration_seconds: Math.max(payload.durationSeconds ?? 5, 1),
        generate_audio: payload.generateAudio ?? false,
        ...(payload.model ? { model: payload.model, model_id: payload.model } : {}),
        ...(payload.genMode ? { gen_mode: payload.genMode } : {}),
        human_review: payload.humanReview ?? false,
        scene_optimize: payload.sceneOptimize ?? null,
        ...nodeContextBody(payload),
      },
    },
  );
}

export interface FreezoneVideoKeyframesPayload extends FreezoneNodeContext {
  /** Static URL of the first frame. At least one of first/last must be set. */
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  prompt?: string;
  cameraTemplateId?: string | null;
  marks?: FreezoneVideoMark[];
  aspectRatio?: FreezoneVideoAspectRatio;
  resolution?: FreezoneVideoResolution;
  durationSeconds?: number;
  generateAudio?: boolean;
  model?: string;
  /** 生成模式（还原用）：textToVideo / imageToVideo / firstLastFrame / imageReference / allReference。 */
  genMode?: string;
  /** See {@link FreezoneVideoGenPayload.humanReview}. */
  humanReview?: boolean;
  sceneOptimize?: "anime" | "realistic" | null;
}

export async function submitFreezoneVideoKeyframes(
  project: string,
  payload: FreezoneVideoKeyframesPayload,
): Promise<FreezoneJobRef> {
  return await apiCall<FreezoneJobRef>(
    `projects/${encodeURIComponent(project)}/freezone/video/keyframes`,
    {
      method: "POST",
      json: {
        first_frame_url: payload.firstFrameUrl ?? null,
        last_frame_url: payload.lastFrameUrl ?? null,
        prompt: payload.prompt ?? "",
        camera_template_id: payload.cameraTemplateId ?? null,
        marks: (payload.marks ?? []).map((m) => ({
          label: m.label,
          source_url: m.sourceUrl ?? "",
          point_x: m.pointX ?? null,
          point_y: m.pointY ?? null,
          box_x: m.boxX ?? null,
          box_y: m.boxY ?? null,
          box_width: m.boxWidth ?? null,
          box_height: m.boxHeight ?? null,
          note: m.note ?? "",
        })),
        aspect_ratio: payload.aspectRatio ?? "16:9",
        resolution: payload.resolution ?? "720p",
        duration_seconds: Math.max(payload.durationSeconds ?? 5, 1),
        generate_audio: payload.generateAudio ?? false,
        ...(payload.model ? { model: payload.model, model_id: payload.model } : {}),
        ...(payload.genMode ? { gen_mode: payload.genMode } : {}),
        human_review: payload.humanReview ?? false,
        scene_optimize: payload.sceneOptimize ?? null,
        ...nodeContextBody(payload),
      },
    },
  );
}

// /freezone/video/i2v ----------------------------------------------------- //
//
// Unified endpoint for 图生视频 (single image, treated as first-frame ref)
// and 图片参考视频 (2-9 images, multi-reference). The backend distinguishes
// these two modes by `image_urls.length`.

export interface FreezoneVideoI2vPayload extends FreezoneNodeContext {
  /** 1-9 image static URLs. First entry is the primary/first-frame ref. */
  imageUrls: string[];
  prompt?: string;
  cameraTemplateId?: string | null;
  marks?: FreezoneVideoMark[];
  aspectRatio?: FreezoneVideoAspectRatio;
  resolution?: FreezoneVideoResolution;
  durationSeconds?: number;
  generateAudio?: boolean;
  /** default huimeng_seedance10_fast (matches keyframes); multi-image prefers seedance 2.0. */
  model?: string;
  /** 生成模式（还原用）：textToVideo / imageToVideo / firstLastFrame / imageReference / allReference。 */
  genMode?: string;
  /** See {@link FreezoneVideoGenPayload.humanReview}. */
  humanReview?: boolean;
  sceneOptimize?: "anime" | "realistic" | null;
}

export async function submitFreezoneVideoI2v(
  project: string,
  payload: FreezoneVideoI2vPayload,
): Promise<FreezoneJobRef> {
  return await apiCall<FreezoneJobRef>(
    `projects/${encodeURIComponent(project)}/freezone/video/i2v`,
    {
      method: "POST",
      json: {
        image_urls: payload.imageUrls.slice(0, 9),
        prompt: payload.prompt ?? "",
        camera_template_id: payload.cameraTemplateId ?? null,
        marks: (payload.marks ?? []).map((m) => ({
          label: m.label,
          source_url: m.sourceUrl ?? "",
          point_x: m.pointX ?? null,
          point_y: m.pointY ?? null,
          box_x: m.boxX ?? null,
          box_y: m.boxY ?? null,
          box_width: m.boxWidth ?? null,
          box_height: m.boxHeight ?? null,
          note: m.note ?? "",
        })),
        aspect_ratio: payload.aspectRatio ?? "16:9",
        resolution: payload.resolution ?? "720p",
        duration_seconds: Math.max(payload.durationSeconds ?? 5, 1),
        generate_audio: payload.generateAudio ?? false,
        ...(payload.model ? { model: payload.model, model_id: payload.model } : {}),
        ...(payload.genMode ? { gen_mode: payload.genMode } : {}),
        human_review: payload.humanReview ?? false,
        scene_optimize: payload.sceneOptimize ?? null,
        ...nodeContextBody(payload),
      },
    },
  );
}

// /freezone/video/video-edit ---------------------------------------------- //
//
// HappyHorse 视频编辑：1 个源视频 + 0-5 张参考图 → 上游 video_url + reference_images。

export interface FreezoneVideoEditPayload extends FreezoneNodeContext {
  /** 源视频静态地址，必填。 */
  videoUrl: string;
  /** 0-5 张参考图静态地址。 */
  imageUrls?: string[];
  prompt?: string;
  cameraTemplateId?: string | null;
  marks?: FreezoneVideoMark[];
  aspectRatio?: FreezoneVideoAspectRatio;
  resolution?: FreezoneVideoResolution;
  durationSeconds?: number;
  /** 视频编辑音频策略：auto 自动 / origin 保留原声。 */
  audioSetting?: "auto" | "origin";
  generateAudio?: boolean;
  /** default newapi_happyhorse-1.0. */
  model?: string;
  /** 生成模式（还原用）：videoEdit。 */
  genMode?: string;
  humanReview?: boolean;
}

export async function submitFreezoneVideoEdit(
  project: string,
  payload: FreezoneVideoEditPayload,
): Promise<FreezoneJobRef> {
  return await apiCall<FreezoneJobRef>(
    `projects/${encodeURIComponent(project)}/freezone/video/video-edit`,
    {
      method: "POST",
      json: {
        video_url: payload.videoUrl,
        image_urls: (payload.imageUrls ?? []).slice(0, 5),
        prompt: payload.prompt ?? "",
        camera_template_id: payload.cameraTemplateId ?? null,
        marks: (payload.marks ?? []).map((m) => ({
          label: m.label,
          source_url: m.sourceUrl ?? "",
          point_x: m.pointX ?? null,
          point_y: m.pointY ?? null,
          box_x: m.boxX ?? null,
          box_y: m.boxY ?? null,
          box_width: m.boxWidth ?? null,
          box_height: m.boxHeight ?? null,
          note: m.note ?? "",
        })),
        aspect_ratio: payload.aspectRatio ?? "16:9",
        resolution: payload.resolution ?? "720p",
        duration_seconds: Math.max(payload.durationSeconds ?? 5, 1),
        audio_setting: payload.audioSetting ?? "auto",
        generate_audio: payload.generateAudio ?? false,
        ...(payload.model ? { model: payload.model, model_id: payload.model } : {}),
        ...(payload.genMode ? { gen_mode: payload.genMode } : {}),
        human_review: payload.humanReview ?? false,
        ...nodeContextBody(payload),
      },
    },
  );
}

// /freezone/video/omni-gen ------------------------------------------------ //

export type FreezoneVideoReferenceType = "image" | "video" | "audio";

export interface FreezoneVideoReferenceItem {
  type: FreezoneVideoReferenceType;
  url: string;
  role?: string;
  label?: string;
}

export interface FreezoneVideoOmniGenPayload extends FreezoneNodeContext {
  prompt: string;
  theme?: string;
  cameraTemplateId?: string | null;
  /** mixed image/video/audio references. backend caps: image≤9, video≤3, audio≤3, total≤12. */
  references?: FreezoneVideoReferenceItem[];
  marks?: FreezoneVideoMark[];
  aspectRatio?: FreezoneVideoAspectRatio;
  resolution?: FreezoneVideoResolution;
  durationSeconds?: number;
  generateAudio?: boolean;
  /** default huimeng_seedance20_fast per backend default. */
  model?: string;
  /** 生成模式（还原用）：textToVideo / imageToVideo / firstLastFrame / imageReference / allReference。 */
  genMode?: string;
  /** See {@link FreezoneVideoGenPayload.humanReview}. */
  humanReview?: boolean;
  sceneOptimize?: "anime" | "realistic" | null;
}

export async function submitFreezoneVideoOmniGen(
  project: string,
  payload: FreezoneVideoOmniGenPayload,
): Promise<FreezoneJobRef> {
  return await apiCall<FreezoneJobRef>(
    `projects/${encodeURIComponent(project)}/freezone/video/omni-gen`,
    {
      method: "POST",
      json: {
        prompt: payload.prompt,
        theme: payload.theme ?? "",
        camera_template_id: payload.cameraTemplateId ?? null,
        references: (payload.references ?? []).map((r) => ({
          type: r.type,
          url: r.url,
          role: r.role ?? "",
          label: r.label ?? "",
        })),
        marks: (payload.marks ?? []).map((m) => ({
          label: m.label,
          source_url: m.sourceUrl ?? "",
          point_x: m.pointX ?? null,
          point_y: m.pointY ?? null,
          box_x: m.boxX ?? null,
          box_y: m.boxY ?? null,
          box_width: m.boxWidth ?? null,
          box_height: m.boxHeight ?? null,
          note: m.note ?? "",
        })),
        aspect_ratio: payload.aspectRatio ?? "16:9",
        resolution: payload.resolution ?? "720p",
        duration_seconds: Math.max(payload.durationSeconds ?? 5, 1),
        generate_audio: payload.generateAudio ?? false,
        ...(payload.model ? { model: payload.model, model_id: payload.model } : {}),
        ...(payload.genMode ? { gen_mode: payload.genMode } : {}),
        human_review: payload.humanReview ?? false,
        scene_optimize: payload.sceneOptimize ?? null,
        ...nodeContextBody(payload),
      },
    },
  );
}

// /freezone/image/style-templates ---------------------------------------- //

export interface FreezoneStyleTemplate {
  id: string;
  label: string;
  /** Free-text English style description forwarded as part of the prompt. */
  style_prompt: string;
  author?: string;
  category?: string;
}

export async function listFreezoneStyleTemplates(
  project: string,
): Promise<FreezoneStyleTemplate[]> {
  return await apiCall<FreezoneStyleTemplate[]>(
    `projects/${encodeURIComponent(project)}/freezone/image/style-templates`,
  );
}

// /freezone/image/camera-options ----------------------------------------- //

export interface FreezoneCameraIdLabel {
  id: string;
  label: string;
}

export interface FreezoneCameraOptions {
  camera_bodies: FreezoneCameraIdLabel[];
  lenses: FreezoneCameraIdLabel[];
  focal_lengths_mm: number[];
  apertures: string[];
}

export async function fetchFreezoneCameraOptions(
  project: string,
): Promise<FreezoneCameraOptions> {
  return await apiCall<FreezoneCameraOptions>(
    `projects/${encodeURIComponent(project)}/freezone/image/camera-options`,
  );
}

// /freezone/image/models -------------------------------------------------- //

export interface FreezoneImageModelInfo {
  /** Stable picker id, e.g. `"huimeng/gpt-image-2"`. */
  id: string;
  /** Provider tab id (`huimeng` / `openrouter` / `openai`). */
  providerId: FreezoneProvider;
  /** Value sent to backend `model` field. */
  apiModel: string;
  /** Display label in the model chip. */
  label: string;
}

// Provider inference for raw model strings the backend may return without
// metadata (e.g. just a flat string list). Order matters — first match wins.
const MODEL_PROVIDER_HINTS: Array<{
  match: (raw: string) => boolean;
  providerId: FreezoneProvider;
}> = [
  { match: (s) => s.toLowerCase().startsWith("huimeng"), providerId: "huimeng" },
  { match: (s) => s.toLowerCase().includes("/gemini"), providerId: "openrouter" },
  { match: (s) => s.toLowerCase().startsWith("google/"), providerId: "openrouter" },
  { match: (s) => s.toLowerCase().startsWith("anthropic/"), providerId: "openrouter" },
  { match: (s) => s.toLowerCase().startsWith("openrouter/"), providerId: "openrouter" },
  { match: (s) => s.toLowerCase().startsWith("gpt-image"), providerId: "openai" },
  { match: (s) => s.toLowerCase().startsWith("dall-e"), providerId: "openai" },
];

function inferProvider(raw: string): FreezoneProvider {
  for (const hint of MODEL_PROVIDER_HINTS) {
    if (hint.match(raw)) return hint.providerId;
  }
  return "huimeng";
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function pickNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
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

function pickStringArray(record: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.length > 0);
    }
  }
  return [];
}

function normalizeProviderId(raw: string | null): FreezoneProvider | null {
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (lowered === "huimeng" || lowered === "openrouter" || lowered === "openai") {
    return lowered;
  }
  return null;
}

function modelEntryFromObject(entry: Record<string, unknown>): FreezoneImageModelInfo | null {
  const apiModel = pickString(entry, "model", "apiModel", "api_model", "name");
  if (!apiModel) return null;
  const providerId =
    normalizeProviderId(pickString(entry, "providerId", "provider_id", "provider")) ??
    inferProvider(apiModel);
  const id = pickString(entry, "id") ?? `${providerId}/${apiModel}`;
  const label = pickString(entry, "label", "displayName", "display_name") ?? apiModel;
  return { id, providerId, apiModel, label };
}

function modelEntryFromString(raw: string): FreezoneImageModelInfo {
  const providerId = inferProvider(raw);
  return {
    id: `${providerId}/${raw}`,
    providerId,
    apiModel: raw,
    label: raw,
  };
}

function coerceModelList(payload: unknown): FreezoneImageModelInfo[] {
  // Accept several shapes the backend might return — schema is empty in
  // openapi.json so we normalize defensively rather than guess one shape.
  let candidate: unknown = payload;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const wrapper = candidate as Record<string, unknown>;
    if (Array.isArray(wrapper.models)) candidate = wrapper.models;
    else if (Array.isArray(wrapper.data)) candidate = wrapper.data;
    else if (Array.isArray(wrapper.items)) candidate = wrapper.items;
    else {
      // provider→models[] map: { huimeng: [...], openrouter: [...] }
      const flattened: FreezoneImageModelInfo[] = [];
      for (const [providerRaw, value] of Object.entries(wrapper)) {
        const providerId = normalizeProviderId(providerRaw);
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
            const entry = modelEntryFromObject(item as Record<string, unknown>);
            if (entry) flattened.push({ ...entry, providerId });
          }
        }
      }
      if (flattened.length > 0) return flattened;
    }
  }

  if (!Array.isArray(candidate)) return [];
  const result: FreezoneImageModelInfo[] = [];
  for (const item of candidate) {
    if (typeof item === "string") {
      result.push(modelEntryFromString(item));
    } else if (item && typeof item === "object") {
      const entry = modelEntryFromObject(item as Record<string, unknown>);
      if (entry) result.push(entry);
    }
  }
  return result;
}

export async function fetchFreezoneImageModels(
  project: string,
): Promise<FreezoneImageModelInfo[]> {
  const payload = await apiCall<unknown>(
    `projects/${encodeURIComponent(project)}/freezone/image/models`,
  );
  return coerceModelList(payload);
}

// /freezone/video/models -------------------------------------------------- //

/** Provider tab id for video generation models. */
export type FreezoneVideoProvider = "seedance" | "huimeng";

export interface FreezoneVideoModelInfo {
  /** Stable picker id, e.g. `"seedance_2"` (backend currently keys by api id). */
  id: string;
  /** Provider tab id (`seedance` / `huimeng`). */
  providerId: FreezoneVideoProvider;
  /** Value sent to backend `/freezone/video/gen` `model` field. */
  apiModel: string;
  /** Display label in the model chip. */
  label: string;
  /** Supported output resolution values for this model, when advertised by backend. */
  resolutionOptions?: FreezoneVideoResolution[];
  /** Smallest supported duration in seconds, when advertised by backend. */
  minDuration?: number | null;
  /** Largest supported duration in seconds, when advertised by backend. */
  maxDuration?: number | null;
  /** Supported Seedance 2.0 Value style hints, when advertised by backend. */
  sceneOptimizeOptions?: Array<"anime" | "realistic">;
  /** Default Seedance 2.0 Value style hint, when advertised by backend. */
  defaultSceneOptimize?: "anime" | "realistic" | null;
}

// Provider inference for raw model ids the backend may return without
// metadata. Order matters — first match wins. Anything we don't recognize
// falls back to `seedance` (the primary provider).
const VIDEO_MODEL_PROVIDER_HINTS: Array<{
  match: (raw: string) => boolean;
  providerId: FreezoneVideoProvider;
}> = [
  { match: (s) => s.toLowerCase().startsWith("huimeng"), providerId: "huimeng" },
  { match: (s) => s.toLowerCase().startsWith("seedance"), providerId: "seedance" },
];

function inferVideoProvider(raw: string): FreezoneVideoProvider {
  for (const hint of VIDEO_MODEL_PROVIDER_HINTS) {
    if (hint.match(raw)) return hint.providerId;
  }
  return "seedance";
}

function normalizeVideoProviderId(raw: string | null): FreezoneVideoProvider | null {
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (lowered === "seedance" || lowered === "huimeng") return lowered;
  return null;
}

function videoModelEntryFromObject(
  entry: Record<string, unknown>,
): FreezoneVideoModelInfo | null {
  const apiModel = pickString(entry, "model", "apiModel", "api_model", "name");
  if (!apiModel) return null;
  const providerId =
    normalizeVideoProviderId(pickString(entry, "providerId", "provider_id", "provider")) ??
    inferVideoProvider(apiModel);
  const id = pickString(entry, "id") ?? apiModel;
  const label = pickString(entry, "label", "displayName", "display_name") ?? apiModel;
  const resolutionOptions = pickStringArray(entry, "resolutionOptions", "resolution_options")
    .map((value) => value.toLowerCase())
    .filter((value): value is FreezoneVideoResolution =>
      value === "480p" || value === "720p" || value === "1080p"
    );
  const sceneOptimizeOptions = pickStringArray(entry, "sceneOptimizeOptions", "scene_optimize_options")
    .map((value) => value.toLowerCase())
    .filter((value): value is "anime" | "realistic" =>
      value === "anime" || value === "realistic"
    );
  const defaultSceneOptimizeRaw = pickString(entry, "defaultSceneOptimize", "default_scene_optimize")
    ?.toLowerCase();
  const defaultSceneOptimize =
    defaultSceneOptimizeRaw === "anime" || defaultSceneOptimizeRaw === "realistic"
      ? defaultSceneOptimizeRaw
      : null;
  return {
    id,
    providerId,
    apiModel,
    label,
    ...(resolutionOptions.length > 0 ? { resolutionOptions } : {}),
    minDuration: pickNumber(entry, "minDuration", "min_duration"),
    maxDuration: pickNumber(entry, "maxDuration", "max_duration"),
    ...(sceneOptimizeOptions.length > 0 ? { sceneOptimizeOptions } : {}),
    defaultSceneOptimize,
  };
}

function videoModelEntryFromString(raw: string): FreezoneVideoModelInfo {
  const providerId = inferVideoProvider(raw);
  return {
    id: raw,
    providerId,
    apiModel: raw,
    label: raw,
  };
}

function coerceVideoModelList(payload: unknown): FreezoneVideoModelInfo[] {
  let candidate: unknown = payload;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const wrapper = candidate as Record<string, unknown>;
    if (Array.isArray(wrapper.models)) candidate = wrapper.models;
    else if (Array.isArray(wrapper.data)) candidate = wrapper.data;
    else if (Array.isArray(wrapper.items)) candidate = wrapper.items;
    else {
      // provider→models[] map: { seedance: [...], huimeng: [...] }
      const flattened: FreezoneVideoModelInfo[] = [];
      for (const [providerRaw, value] of Object.entries(wrapper)) {
        const providerId = normalizeVideoProviderId(providerRaw);
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
            const entry = videoModelEntryFromObject(item as Record<string, unknown>);
            if (entry) flattened.push({ ...entry, providerId });
          }
        }
      }
      if (flattened.length > 0) return flattened;
    }
  }

  if (!Array.isArray(candidate)) return [];
  const result: FreezoneVideoModelInfo[] = [];
  for (const item of candidate) {
    if (typeof item === "string") {
      result.push(videoModelEntryFromString(item));
    } else if (item && typeof item === "object") {
      const entry = videoModelEntryFromObject(item as Record<string, unknown>);
      if (entry) result.push(entry);
    }
  }
  return result;
}

export async function fetchFreezoneVideoModels(
  project: string,
): Promise<FreezoneVideoModelInfo[]> {
  const payload = await apiCall<unknown>(
    `projects/${encodeURIComponent(project)}/freezone/video/models`,
  );
  return coerceVideoModelList(payload);
}

// /freezone/video/camera-templates --------------------------------------- //

function coerceCameraTemplateList(payload: unknown): CameraMovementPreset[] {
  // openapi.json schema is empty `{}` — backend shape isn't documented.
  // Accept several common envelopes defensively.
  let candidate: unknown = payload;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const wrapper = candidate as Record<string, unknown>;
    if (Array.isArray(wrapper.templates)) candidate = wrapper.templates;
    else if (Array.isArray(wrapper.data)) candidate = wrapper.data;
    else if (Array.isArray(wrapper.items)) candidate = wrapper.items;
    else if (Array.isArray(wrapper.camera_templates)) candidate = wrapper.camera_templates;
  }
  if (!Array.isArray(candidate)) return [];
  const result: CameraMovementPreset[] = [];
  for (const item of candidate) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const id = pickString(entry, "id", "template_id", "templateId", "name", "key");
    if (!id) continue;
    const label =
      pickString(entry, "label", "display_name", "displayName", "title", "name") ?? id;
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

export async function fetchFreezoneVideoCameraTemplates(
  project: string,
): Promise<CameraMovementPreset[]> {
  const payload = await apiCall<unknown>(
    `projects/${encodeURIComponent(project)}/freezone/video/camera-templates`,
  );
  return coerceCameraTemplateList(payload);
}

// /freezone/edit ---------------------------------------------------------- //

export interface FreezoneEditPayload extends FreezoneNodeContext {
  prompt: string;
  baseUrl: string;
  extraReferenceUrls?: string[];
  aspectRatio?: string;
  imageSize?: string;
  provider?: FreezoneProvider | null;
  model?: string | null;
  /** 注册表模型 id（还原用；与 provider 拆分后的 model 串不同）。 */
  modelId?: string | null;
  /** 生成模式（还原用）：text_to_image / image_to_image / all_reference / image_reference。 */
  genMode?: string | null;
  quality?: string | null;
}

export async function submitFreezoneEdit(
  project: string,
  payload: FreezoneEditPayload,
): Promise<FreezoneJobRef> {
  // 基准图与额外引用图同样必须是后端可解析的静态 URL，base64 先上传。
  const baseUrl = await ensureBackendImageUrl(project, payload.baseUrl);
  const extraReferenceUrls = await ensureBackendImageUrls(
    project,
    payload.extraReferenceUrls,
  );
  return await apiCall<FreezoneJobRef>(
    `projects/${encodeURIComponent(project)}/freezone/edit`,
    {
      method: "POST",
      json: {
        prompt: payload.prompt,
        base_url: baseUrl,
        extra_reference_urls: extraReferenceUrls,
        aspect_ratio: payload.aspectRatio ?? "2:3",
        image_size: payload.imageSize ?? "2K",
        provider: payload.provider ?? null,
        model: payload.model ?? null,
        ...(payload.modelId ? { model_id: payload.modelId } : {}),
        ...(payload.genMode ? { gen_mode: payload.genMode } : {}),
        quality: payload.quality ?? null,
        ...nodeContextBody(payload),
      },
    },
  );
}

// /freezone/extract-frames ------------------------------------------------ //

export interface FreezoneExtractPayload {
  videoUrl: string;
  maxFrames?: number;
  sceneThreshold?: number;
}

export async function submitFreezoneExtract(
  project: string,
  payload: FreezoneExtractPayload,
): Promise<FreezoneJobRef> {
  return await apiCall<FreezoneJobRef>(
    `projects/${encodeURIComponent(project)}/freezone/extract-frames`,
    {
      method: "POST",
      json: {
        video_url: payload.videoUrl,
        max_frames: payload.maxFrames ?? 20,
        scene_threshold: payload.sceneThreshold ?? 0.3,
      },
    },
  );
}

// /freezone/analyze-shots ------------------------------------------------- //

export interface FreezoneAnalyzePayload {
  frameUrls: string[];
  /** Analysis is a backend capability; Freezone UI sends OpenRouter by default. */
  provider?: "openrouter" | null;
  /** Optional backend model override for internal/debug use. */
  model?: string | null;
}

export async function submitFreezoneAnalyze(
  project: string,
  payload: FreezoneAnalyzePayload,
): Promise<FreezoneJobRef> {
  return await apiCall<FreezoneJobRef>(
    `projects/${encodeURIComponent(project)}/freezone/analyze-shots`,
    {
      method: "POST",
      json: {
        frame_urls: payload.frameUrls,
        provider: payload.provider ?? null,
        model: payload.model ?? null,
      },
    },
  );
}
