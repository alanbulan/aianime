// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";
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
