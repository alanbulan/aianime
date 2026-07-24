// Copyright (c) 2026 AI anime
import type {
  BeatVideoPromptResponse,
  NarratorVoiceMutationResponse,
  ProductionDataResponse,
  ProductionErrorResponse,
  ProductionTaskResponse,
  ProductionVideoGateway,
  Seedance2BeatStatusResponse,
  Seedance2PromptResponse,
  VideoPoolResponse,
  VideoPoolSelectResponse,
} from "@/modules/production/application/ports";
import type {
  NarratorVoiceSourcesData,
  NarratorVoiceStatusData,
} from "@/modules/production/domain/narrator-voice";
import type { GenerateAudioCommand } from "@/modules/production/domain/audio-generation";
import type { FinalVideoData } from "@/modules/production/domain/episode-compose";
import type {
  RenderSettingsData,
  SketchSettingsData,
  UpdateRenderSettingsCommand,
  UpdateSketchSettingsCommand,
} from "@/modules/production/domain/image-settings";
import type {
  CreateRenderPlanCommand,
  ExecuteRenderPlanCommand,
  RenderExecuteResult,
  RenderPlan,
} from "@/modules/production/domain/render-plan";
import {
  DEFAULT_VIDEO_BACKEND,
  type VideoBackendOption,
} from "@/modules/production/domain/video-backend";
import type { VideoInputCropTarget } from "@/modules/production/domain/seedance2-panel";
import type {
  SketchRegenQueueData,
  SketchRegenQueueItem,
} from "@/modules/production/domain/sketch-regen-queue";
import type {
  CropSketchCommand,
  SaveSketchPoseEditorCommand,
  SketchCropResult,
  SketchPoseEditorData,
  SketchPoseEditorSaveResult,
} from "@/modules/production/domain/sketch-pose-editor";
import { p } from "@/shared/api/path";
import { api } from "@/shared/api/transport";
import { jsonWithBackendError } from "@/shared/api/errors";

export const httpProductionVideoGateway: ProductionVideoGateway = {
  async listVideoBackends(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/video-backends`, { signal })
      .json<ProductionDataResponse<VideoBackendOption[]>>();
  },
  async getVideoPool(project, episode, signal) {
    return api
      .get(p`api/v1/projects/${project}/episodes/${episode}/video-pool`, {
        signal,
      })
      .json<VideoPoolResponse>();
  },
  async selectVideoPoolEntry(project, episode, beatNumber, poolId) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/video-pool-select`,
        { json: { pool_id: poolId } },
      )
      .json<VideoPoolSelectResponse>();
  },
  async getSeedance2BeatStatus(project, episode, beatNumber, signal) {
    return api
      .get(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/seedance2-status`,
        { signal },
      )
      .json<Seedance2BeatStatusResponse>();
  },
  async uploadSeedance2Asset(project, episode, beatNumber, file) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/seedance2/assets/upload`,
        { body: formData },
      )
      .json<Seedance2BeatStatusResponse>();
  },
  async deleteSeedance2Asset(
    project,
    episode,
    beatNumber,
    mediaKind,
    path,
  ) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/seedance2/assets/delete`,
        { json: { media_kind: mediaKind, path } },
      )
      .json<Seedance2BeatStatusResponse>();
  },
  async cropSeedance2Asset(
    project,
    episode,
    beatNumber,
    assetKey,
    sourcePath,
    target: VideoInputCropTarget,
    crop,
  ) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/seedance2/assets/crop`,
        {
          json: {
            asset_key: assetKey,
            source_path: sourcePath,
            target,
            ...crop,
          },
        },
      )
      .json<Seedance2BeatStatusResponse>();
  },
  async trimSeedance2Asset(
    project,
    episode,
    beatNumber,
    assetKey,
    sourcePath,
    startSeconds,
    durationSeconds,
  ) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/seedance2/assets/audio-trim`,
        {
          json: {
            asset_key: assetKey,
            source_path: sourcePath,
            start_seconds: startSeconds,
            duration_seconds: durationSeconds,
          },
        },
      )
      .json<Seedance2BeatStatusResponse>();
  },
  async optimizeEpisodeVideo(project, episode, language) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/optimize/video-global`,
        { json: { language } },
      )
      .json<ProductionTaskResponse | ProductionErrorResponse>();
  },
  async generateSeedance2Prompt(project, episode, command) {
    return jsonWithBackendError<Seedance2PromptResponse>(
      api.post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${command.beatNum}/seedance2-prompt/generate`,
        {
          json: {
            manual_prompt_reference: command.manualPromptReference ?? "",
            prompt_guidance: command.promptGuidance ?? "",
          },
          throwHttpErrors: false,
        },
      ),
    );
  },
  async generateBeatVideoPrompt(
    project,
    episode,
    beatNumber,
    language,
  ) {
    return jsonWithBackendError<BeatVideoPromptResponse>(
      api.post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/video-prompt/generate`,
        { json: { language }, throwHttpErrors: false },
      ),
    );
  },
  async regenerateBeatVideo(project, episode, command) {
    return jsonWithBackendError<
      ProductionTaskResponse | ProductionErrorResponse
    >(
      api.post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${command.beatNum}/video`,
        {
          json: {
            video_backend: command.videoBackend ?? DEFAULT_VIDEO_BACKEND,
            use_director_render: command.useDirectorRender,
            ...(command.resolution !== undefined
              ? { resolution: command.resolution }
              : {}),
            ...(command.duration !== undefined
              ? { duration: command.duration }
              : {}),
            ...(command.ratio !== undefined ? { ratio: command.ratio } : {}),
            ...(command.mode !== undefined ? { mode: command.mode } : {}),
            ...(command.seedance2ConfigJson !== undefined
              ? { seedance2_config_json: command.seedance2ConfigJson }
              : {}),
            ...(command.audioSetting !== undefined
              ? { audio_setting: command.audioSetting }
              : {}),
          },
          throwHttpErrors: false,
        },
      ),
    );
  },
  async getNarratorVoiceStatus(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/narrator-voice`, { signal })
      .json<ProductionDataResponse<NarratorVoiceStatusData>>();
  },
  async listNarratorVoiceSources(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/narrator-voice/sources`, { signal })
      .json<ProductionDataResponse<NarratorVoiceSourcesData>>();
  },
  async uploadNarratorVoice(project, file) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return api
      .post(p`api/v1/projects/${project}/narrator-voice/upload`, {
        body: formData,
      })
      .json<NarratorVoiceMutationResponse>();
  },
  async recordNarratorVoice(project, dataUrl) {
    return api
      .post(p`api/v1/projects/${project}/narrator-voice/record`, {
        json: { data_url: dataUrl },
      })
      .json<NarratorVoiceMutationResponse>();
  },
  async copyProjectNarratorVoice(project, sourcePath) {
    return api
      .post(p`api/v1/projects/${project}/narrator-voice/copy`, {
        json: { source_path: sourcePath },
      })
      .json<NarratorVoiceMutationResponse>();
  },
  async trimNarratorVoice(project, startSeconds, durationSeconds) {
    return api
      .post(p`api/v1/projects/${project}/narrator-voice/trim`, {
        json: {
          start_seconds: startSeconds,
          duration_seconds: durationSeconds,
        },
      })
      .json<NarratorVoiceMutationResponse>();
  },
  async deleteNarratorVoice(project) {
    return api
      .post(p`api/v1/projects/${project}/narrator-voice/delete`)
      .json<NarratorVoiceMutationResponse>();
  },
  async generateEpisodeAudio(
    project,
    episode,
    command?: GenerateAudioCommand,
  ) {
    const json: { beat_numbers?: number[]; mode?: string } = {};
    if (command?.beatNumbers) json.beat_numbers = command.beatNumbers;
    if (command?.mode) json.mode = command.mode;
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/audio/generate`,
        { json },
      )
      .json<ProductionTaskResponse | ProductionErrorResponse>();
  },
  async regenerateBeatAudio(project, episode, beatNumber) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}/audio`,
      )
      .json<ProductionTaskResponse | ProductionErrorResponse>();
  },
  async getRenderSettings(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/render-settings`, { signal })
      .json<ProductionDataResponse<RenderSettingsData>>();
  },
  async updateRenderSettings(
    project,
    command: UpdateRenderSettingsCommand,
  ) {
    return api
      .patch(p`api/v1/projects/${project}/render-settings`, {
        json: {
          ...(command.renderImageSelection !== undefined
            ? { render_image_selection: command.renderImageSelection }
            : {}),
          ...(command.sketchAspectPadding !== undefined
            ? { sketch_aspect_padding: command.sketchAspectPadding }
            : {}),
        },
      })
      .json<
        ProductionDataResponse<RenderSettingsData> | ProductionErrorResponse
      >();
  },
  async getSketchSettings(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/sketch-settings`, { signal })
      .json<ProductionDataResponse<SketchSettingsData>>();
  },
  async updateSketchSettings(
    project,
    command: UpdateSketchSettingsCommand,
  ) {
    return api
      .patch(p`api/v1/projects/${project}/sketch-settings`, {
        json: {
          ...(command.sketchImageSelection !== undefined
            ? { sketch_image_selection: command.sketchImageSelection }
            : {}),
        },
      })
      .json<
        ProductionDataResponse<SketchSettingsData> | ProductionErrorResponse
      >();
  },
  async createRenderPlan(
    project,
    episode,
    command: CreateRenderPlanCommand,
  ) {
    return api
      .post(p`api/v1/projects/${project}/episodes/${episode}/render/plan`, {
        json: {
          beat_indices: command.beatIndices,
          strategy: command.strategy,
          aspect_mode: command.aspectMode,
          ...(command.forceOneByOne !== undefined
            ? { force_one_by_one: command.forceOneByOne }
            : {}),
          ...(command.imageGenerationSelection !== undefined
            ? {
                image_generation_selection: command.imageGenerationSelection,
              }
            : {}),
          ...(command.sketchAspectPadding !== undefined
            ? { sketch_aspect_padding: command.sketchAspectPadding }
            : {}),
        },
      })
      .json<ProductionDataResponse<RenderPlan> | ProductionErrorResponse>();
  },
  async executeRenderPlan(
    project,
    episode,
    command: ExecuteRenderPlanCommand,
  ) {
    return api
      .post(p`api/v1/projects/${project}/episodes/${episode}/render/execute`, {
        json: {
          plan: command.plan,
          plan_hash: command.planHash,
          input_fingerprint: command.inputFingerprint,
          strategy: command.strategy,
          aspect_mode: command.aspectMode,
          beat_indices: command.beatIndices,
          ...(command.forceOneByOne !== undefined
            ? { force_one_by_one: command.forceOneByOne }
            : {}),
          ...(command.imageGenerationSelection !== undefined
            ? {
                image_generation_selection: command.imageGenerationSelection,
              }
            : {}),
          ...(command.sketchAspectPadding !== undefined
            ? { sketch_aspect_padding: command.sketchAspectPadding }
            : {}),
          ...(command.customPlan !== undefined
            ? { custom_plan: command.customPlan }
            : {}),
        },
      })
      .json<
        ProductionDataResponse<RenderExecuteResult> | ProductionErrorResponse
      >();
  },
  async getSketchRegenQueue(project, episode, signal) {
    return api
      .get(
        p`api/v1/projects/${project}/episodes/${episode}/sketch-regen-queue`,
        { signal },
      )
      .json<ProductionDataResponse<SketchRegenQueueData>>();
  },
  async saveSketchRegenQueue(project, episode, items: SketchRegenQueueItem[]) {
    return api
      .put(
        p`api/v1/projects/${project}/episodes/${episode}/sketch-regen-queue`,
        { json: { items } },
      )
      .json<ProductionDataResponse<SketchRegenQueueData>>();
  },
  async getSketchPoseEditor(project, episode, beatNum, signal) {
    return api
      .get(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/sketch/pose-editor`,
        { signal },
      )
      .json<
        ProductionDataResponse<SketchPoseEditorData> | ProductionErrorResponse
      >();
  },
  async saveSketchPoseEditor(
    project,
    episode,
    command: SaveSketchPoseEditorCommand,
  ) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${command.beatNum}/sketch/pose-editor`,
        { json: command.state },
      )
      .json<
        | ProductionDataResponse<SketchPoseEditorSaveResult>
        | ProductionErrorResponse
      >();
  },
  async cropSketch(project, episode, command: CropSketchCommand) {
    return api
      .post(
        p`api/v1/projects/${project}/episodes/${episode}/beats/${command.beatNum}/sketch/crop`,
        { json: command.crop },
      )
      .json<ProductionDataResponse<SketchCropResult> | ProductionErrorResponse>();
  },
  async composeEpisode(project, episode, command) {
    return api
      .post(p`api/v1/projects/${project}/episodes/${episode}/videos/compose`, {
        json: {
          add_subtitles: command.addSubtitles,
          add_bgm: command.addBgm,
          resolution: command.resolution,
        },
      })
      .json<ProductionTaskResponse>();
  },
  async getFinalVideo(project, episode, signal) {
    return api
      .get(p`api/v1/projects/${project}/episodes/${episode}/final`, { signal })
      .json<ProductionDataResponse<FinalVideoData>>();
  },
};
