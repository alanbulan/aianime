// Copyright (c) 2026 AI anime
import type { Beat } from "@/modules/narrative_planning/public";
import type { GenerateAudioCommand } from "@/modules/production/domain/audio-generation";
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
  NarratorVoiceSourcesData,
  NarratorVoiceStatusData,
} from "@/modules/production/domain/narrator-voice";
import type {
  CreateRenderPlanCommand,
  ExecuteRenderPlanCommand,
  RenderExecuteResult,
  RenderPlan,
} from "@/modules/production/domain/render-plan";
import type {
  GenerateSeedance2PromptCommand,
  RegenerateBeatVideoCommand,
  VideoPromptLanguage,
} from "@/modules/production/domain/video-generation";
import type { VideoPoolData } from "@/modules/production/domain/video-pool";
import type {
  Seedance2BeatStatus,
  VideoInputCropTarget,
} from "@/modules/production/domain/seedance2-panel";
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
import type {
  AssignColorsResult,
  DetectIdentitiesResult,
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

export interface Seedance2PromptResult {
  beat: Beat;
  seedance2_config_json: string;
  final_prompt: string;
  prompt_source?: string;
}

export interface BeatVideoPromptResult {
  beat: Beat;
  field: "video_prompt" | "keyframe_prompt";
  prompt: string;
}

export interface ProductionVideoGateway {
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
  getSeedance2BeatStatus(
    project: string,
    episode: number,
    beatNumber: number,
    signal?: AbortSignal,
  ): Promise<Seedance2BeatStatusResponse>;
  uploadSeedance2Asset(
    project: string,
    episode: number,
    beatNumber: number,
    file: File,
  ): Promise<Seedance2BeatStatusResponse>;
  deleteSeedance2Asset(
    project: string,
    episode: number,
    beatNumber: number,
    mediaKind: "images" | "audios",
    path: string,
  ): Promise<Seedance2BeatStatusResponse>;
  cropSeedance2Asset(
    project: string,
    episode: number,
    beatNumber: number,
    assetKey: string,
    sourcePath: string,
    target: VideoInputCropTarget,
    crop: { x: number; y: number; width: number; height: number },
  ): Promise<Seedance2BeatStatusResponse>;
  trimSeedance2Asset(
    project: string,
    episode: number,
    beatNumber: number,
    assetKey: string,
    sourcePath: string,
    startSeconds: number,
    durationSeconds: number,
  ): Promise<Seedance2BeatStatusResponse>;
  optimizeEpisodeVideo(
    project: string,
    episode: number,
    language: VideoPromptLanguage,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  generateSeedance2Prompt(
    project: string,
    episode: number,
    command: GenerateSeedance2PromptCommand,
  ): Promise<Seedance2PromptResponse>;
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
  listNarratorVoiceSources(
    project: string,
    signal?: AbortSignal,
  ): Promise<ProductionDataResponse<NarratorVoiceSourcesData>>;
  uploadNarratorVoice(
    project: string,
    file: File,
  ): Promise<NarratorVoiceMutationResponse>;
  recordNarratorVoice(
    project: string,
    dataUrl: string,
  ): Promise<NarratorVoiceMutationResponse>;
  copyProjectNarratorVoice(
    project: string,
    sourcePath: string,
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
  regenerateBeatAudio(
    project: string,
    episode: number,
    beatNumber: number,
    model: string,
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
  getSketchRegenQueue(
    project: string,
    episode: number,
    signal?: AbortSignal,
  ): Promise<ProductionDataResponse<SketchRegenQueueData>>;
  saveSketchRegenQueue(
    project: string,
    episode: number,
    items: SketchRegenQueueItem[],
  ): Promise<ProductionDataResponse<SketchRegenQueueData>>;
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
  ): Promise<
    ProductionDataResponse<DetectIdentitiesResult> | ProductionErrorResponse
  >;
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

export type Seedance2BeatStatusResponse =
  | ProductionDataResponse<Seedance2BeatStatus>
  | ProductionErrorResponse;

export type Seedance2PromptResponse =
  | ProductionDataResponse<Seedance2PromptResult>
  | ProductionErrorResponse;

export type BeatVideoPromptResponse =
  | ProductionDataResponse<BeatVideoPromptResult>
  | ProductionTaskResponse
  | ProductionErrorResponse;

export type NarratorVoiceMutationResponse =
  | ProductionDataResponse<NarratorVoiceStatusData>
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
