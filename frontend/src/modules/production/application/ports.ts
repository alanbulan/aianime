// Copyright (c) 2026 AI anime
import type { Beat } from "@/modules/narrative_planning/public";
import type {
  AudioGenerationPlan,
  GenerateAudioCommand,
} from "@/modules/production/domain/audio-generation";
import type {
  ComposeEpisodeCommand,
  EpisodeExportKind,
  FinalVideoData,
} from "@/modules/production/domain/episode-compose";
import type {
  RenderSettingsData,
  SketchSettingsData,
  UpdateRenderSettingsCommand,
  UpdateSketchSettingsCommand,
} from "@/modules/production/domain/image-settings";
import type {
  GridCutCommand,
  GridCutResult,
  GridPromptQuery,
  GridPromptResult,
  GridSketchPreviewQuery,
  GridSketchPreviewResult,
  GridUploadCommand,
  GridUploadResult,
} from "@/modules/production/domain/image-grid";
import type {
  BeatImageType,
  BeatImageUploadResult,
  ImagePoolData,
  ImagePoolRebuildResult,
  ImagePoolSelectionResult,
} from "@/modules/production/domain/image-pool";
import type {
  GenerateNarratorVoiceDesignCommand,
  GenerateNarratorVoicePresetCommand,
  NarratorVoiceStatusData,
} from "@/modules/production/domain/narrator-voice";
import type {
  CreateRenderPlanCommand,
  ExecuteRenderPlanCommand,
  RenderExecuteResult,
  RenderPlan,
} from "@/modules/production/domain/render-plan";
import type {
  GenerateVideoPromptCommand,
  RegenerateBeatVideoCommand,
  VideoPromptLanguage,
} from "@/modules/production/domain/video-generation";
import type { VideoPoolData } from "@/modules/production/domain/video-pool";
import type {
  VideoReferenceBeatStatus,
  VideoInputCropTarget,
} from "@/modules/production/domain/video-reference-panel";
import type {
  CropSketchCommand,
  SaveSketchPoseEditorCommand,
  SketchCropSourceData,
  SketchCropResult,
  SketchPoseEditorData,
  SketchPoseEditorSaveResult,
} from "@/modules/production/domain/sketch-pose-editor";
import type {
  AssignColorsResult,
} from "@/modules/production/domain/sketch-markers";
import type {
  GenerateSketchesCommand,
  RegenerateGridCommand,
  RegenerateRenderBeatsCommand,
  RegenerateSketchesCommand,
} from "@/modules/production/domain/sketch-generation";

export interface ProductionDataResponse<T> {
  ok: true;
  data: T;
}

export interface ProductionErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export function isProductionErrorResponse(
  value: unknown,
): value is ProductionErrorResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { ok?: unknown }).ok === false,
  );
}

export interface ProductionTaskResponse {
  ok: true;
  task_type: string;
  task_id?: string;
  task_key?: string;
  message: string;
  scope?: string;
}

export interface VideoPromptOptimizationResult {
  beat: Beat;
  video_config_json: string;
  final_prompt: string;
  prompt_source?: string;
}

export interface BeatVideoPromptResult {
  beat: Beat;
  field: "video_prompt" | "keyframe_prompt";
  prompt: string;
}

export interface ProductionVideoGateway {
  runProductionWorkflow(
    project: string,
    episode: number,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  getVideoPool(
    project: string,
    episode: number,
    signal?: AbortSignal,
  ): Promise<VideoPoolResponse>;
  getImagePool(
    project: string,
    episode: number,
    signal?: AbortSignal,
  ): Promise<ImagePoolResponse>;
  rebuildImagePoolIndex(
    project: string,
    episode: number,
  ): Promise<ProductionDataResponse<ImagePoolRebuildResult>>;
  selectImagePoolEntry(
    project: string,
    episode: number,
    beatNumber: number,
    poolId: string,
    force: boolean,
  ): Promise<ImagePoolSelectResponse>;
  deleteImagePoolEntry(
    project: string,
    episode: number,
    poolId: string,
  ): Promise<PoolDeleteResponse>;
  uploadBeatImage(
    project: string,
    episode: number,
    beatNumber: number,
    imageType: BeatImageType,
    file: File,
  ): Promise<BeatImageUploadResponse>;
  uploadGrid(
    project: string,
    episode: number,
    command: GridUploadCommand,
    file: File,
  ): Promise<GridUploadResponse>;
  getSketchGridPreview(
    project: string,
    episode: number,
    query: GridSketchPreviewQuery,
    signal?: AbortSignal,
  ): Promise<GridSketchPreviewResponse>;
  exportGridPrompt(
    project: string,
    episode: number,
    query: GridPromptQuery,
  ): Promise<GridPromptResponse>;
  cutGrid(
    project: string,
    episode: number,
    command: GridCutCommand,
  ): Promise<GridCutResponse>;
  selectVideoPoolEntry(
    project: string,
    episode: number,
    beatNumber: number,
    poolId: string,
  ): Promise<VideoPoolSelectResponse>;
  deleteVideoPoolEntry(
    project: string,
    episode: number,
    poolId: string,
  ): Promise<PoolDeleteResponse>;
  getVideoReferenceBeatStatus(
    project: string,
    episode: number,
    beatNumber: number,
    signal?: AbortSignal,
  ): Promise<VideoReferenceBeatStatusResponse>;
  uploadVideoReferenceAsset(
    project: string,
    episode: number,
    beatNumber: number,
    file: File,
  ): Promise<VideoReferenceBeatStatusResponse>;
  deleteVideoReferenceAsset(
    project: string,
    episode: number,
    beatNumber: number,
    mediaKind: "images" | "videos" | "audios",
    path: string,
  ): Promise<VideoReferenceBeatStatusResponse>;
  cropVideoReferenceAsset(
    project: string,
    episode: number,
    beatNumber: number,
    assetKey: string,
    sourcePath: string,
    target: VideoInputCropTarget,
    crop: { x: number; y: number; width: number; height: number },
  ): Promise<VideoReferenceBeatStatusResponse>;
  trimVideoReferenceAsset(
    project: string,
    episode: number,
    beatNumber: number,
    assetKey: string,
    sourcePath: string,
    startSeconds: number,
    durationSeconds: number,
  ): Promise<VideoReferenceBeatStatusResponse>;
  optimizeEpisodeVideo(
    project: string,
    episode: number,
    language: VideoPromptLanguage,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  generateVideoPrompt(
    project: string,
    episode: number,
    command: GenerateVideoPromptCommand,
  ): Promise<VideoPromptOptimizationResponse>;
  generateBeatVideoPrompt(
    project: string,
    episode: number,
    beatNumber: number,
    language: VideoPromptLanguage,
  ): Promise<BeatVideoPromptResponse>;
  regenerateBeatVideo(
    project: string,
    episode: number,
    command: RegenerateBeatVideoCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  getNarratorVoiceStatus(
    project: string,
    signal?: AbortSignal,
  ): Promise<ProductionDataResponse<NarratorVoiceStatusData>>;
  uploadNarratorVoice(
    project: string,
    file: File,
  ): Promise<NarratorVoiceMutationResponse>;
  recordNarratorVoice(
    project: string,
    dataUrl: string,
  ): Promise<NarratorVoiceMutationResponse>;
  generateNarratorVoicePreset(
    project: string,
    command: GenerateNarratorVoicePresetCommand,
  ): Promise<NarratorVoiceGenerationResponse>;
  designNarratorVoice(
    project: string,
    command: GenerateNarratorVoiceDesignCommand,
  ): Promise<NarratorVoiceGenerationResponse>;
  bindNarratorVoice(
    project: string,
    voiceId: string,
  ): Promise<NarratorVoiceMutationResponse>;
  trimNarratorVoice(
    project: string,
    startSeconds: number,
    durationSeconds: number,
  ): Promise<NarratorVoiceMutationResponse>;
  deleteNarratorVoice(project: string): Promise<NarratorVoiceMutationResponse>;
  generateEpisodeAudio(
    project: string,
    episode: number,
    command: GenerateAudioCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  getEpisodeAudioGenerationPlan(
    project: string,
    episode: number,
    command: GenerateAudioCommand,
    signal?: AbortSignal,
  ): Promise<ProductionDataResponse<AudioGenerationPlan>>;
  regenerateBeatAudio(
    project: string,
    episode: number,
    beatNumber: number,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  generateSketches(
    project: string,
    episode: number,
    command?: GenerateSketchesCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  generateDirectorControlSketch(
    project: string,
    episode: number,
    beatNumber: number,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  regenerateGrid(
    project: string,
    episode: number,
    command: RegenerateGridCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  regenerateSketches(
    project: string,
    episode: number,
    command: RegenerateSketchesCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  regenerateRenderBeats(
    project: string,
    episode: number,
    command: RegenerateRenderBeatsCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  getRenderSettings(
    project: string,
    signal?: AbortSignal,
  ): Promise<ProductionDataResponse<RenderSettingsData>>;
  updateRenderSettings(
    project: string,
    command: UpdateRenderSettingsCommand,
  ): Promise<
    ProductionDataResponse<RenderSettingsData> | ProductionErrorResponse
  >;
  getSketchSettings(
    project: string,
    signal?: AbortSignal,
  ): Promise<ProductionDataResponse<SketchSettingsData>>;
  updateSketchSettings(
    project: string,
    command: UpdateSketchSettingsCommand,
  ): Promise<
    ProductionDataResponse<SketchSettingsData> | ProductionErrorResponse
  >;
  createRenderPlan(
    project: string,
    episode: number,
    command: CreateRenderPlanCommand,
  ): Promise<ProductionDataResponse<RenderPlan> | ProductionErrorResponse>;
  executeRenderPlan(
    project: string,
    episode: number,
    command: ExecuteRenderPlanCommand,
  ): Promise<
    ProductionDataResponse<RenderExecuteResult> | ProductionErrorResponse
  >;
  getSketchPoseEditor(
    project: string,
    episode: number,
    beatNum: number,
    signal?: AbortSignal,
  ): Promise<
    ProductionDataResponse<SketchPoseEditorData> | ProductionErrorResponse
  >;
  saveSketchPoseEditor(
    project: string,
    episode: number,
    command: SaveSketchPoseEditorCommand,
  ): Promise<
    | ProductionDataResponse<SketchPoseEditorSaveResult>
    | ProductionErrorResponse
  >;
  getSketchCropSource(
    project: string,
    episode: number,
    beatNum: number,
    signal?: AbortSignal,
  ): Promise<
    ProductionDataResponse<SketchCropSourceData> | ProductionErrorResponse
  >;
  cropSketch(
    project: string,
    episode: number,
    command: CropSketchCommand,
  ): Promise<ProductionDataResponse<SketchCropResult> | ProductionErrorResponse>;
  assignSketchColors(
    project: string,
    episode: number,
    force: boolean,
  ): Promise<ProductionDataResponse<AssignColorsResult> | ProductionErrorResponse>;
  detectSketchIdentities(
    project: string,
    episode: number,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  composeEpisode(
    project: string,
    episode: number,
    command: ComposeEpisodeCommand,
  ): Promise<ProductionTaskResponse>;
  exportEpisode(
    project: string,
    episode: number,
    kind: EpisodeExportKind,
  ): Promise<Blob>;
  getFinalVideo(
    project: string,
    episode: number,
    signal?: AbortSignal,
  ): Promise<ProductionDataResponse<FinalVideoData>>;
}

export type VideoPoolResponse = ProductionDataResponse<VideoPoolData | null>;

export type ImagePoolResponse = ProductionDataResponse<ImagePoolData | null>;

export type PoolDeleteResponse =
  | ProductionDataResponse<{ pool_id: string }>
  | ProductionErrorResponse;

export interface ImagePoolSelectResponse {
  ok: boolean;
  error?: string;
  stale?: boolean;
  data?: ImagePoolSelectionResult;
}

export type BeatImageUploadResponse =
  | ProductionDataResponse<BeatImageUploadResult>
  | ProductionErrorResponse;

export type GridUploadResponse =
  | ProductionDataResponse<GridUploadResult>
  | ProductionErrorResponse;

export type GridSketchPreviewResponse =
  | ProductionDataResponse<GridSketchPreviewResult>
  | ProductionErrorResponse;

export type GridPromptResponse =
  | ProductionDataResponse<GridPromptResult>
  | ProductionErrorResponse;

export type GridCutResponse =
  | ProductionDataResponse<GridCutResult>
  | ProductionErrorResponse;

export type VideoReferenceBeatStatusResponse =
  | ProductionDataResponse<VideoReferenceBeatStatus>
  | ProductionErrorResponse;

export type VideoPromptOptimizationResponse =
  | ProductionTaskResponse
  | ProductionErrorResponse;

export type BeatVideoPromptResponse =
  | ProductionDataResponse<BeatVideoPromptResult>
  | ProductionTaskResponse
  | ProductionErrorResponse;

export type NarratorVoiceMutationResponse =
  | ProductionDataResponse<NarratorVoiceStatusData>
  | ProductionErrorResponse;

export type NarratorVoiceGenerationResponse =
  | ProductionTaskResponse
  | ProductionErrorResponse;

export interface VideoPoolSelectResponse {
  ok: boolean;
  error?: string;
  data?: {
    beat_num: number;
    pool_id: string;
    video_url: string;
  };
}
