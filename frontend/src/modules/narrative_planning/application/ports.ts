import type {
  Beat,
  BeatUpdate,
  Episode,
  EpisodePropMenuItem,
  EpisodeSceneMenuItem,
  PipelineStatus,
  Script,
} from "@/modules/narrative_planning/domain/types";

export interface DataResponse<T> {
  ok: true;
  data: T;
}

export interface NarrativeErrorResult {
  ok: false;
  error: string;
  code?: string;
}

export interface NarrativeTaskResult {
  ok: true;
  task_type: string;
  task_id?: string;
  task_key?: string;
  message: string;
  scope?: string;
  backend?: string;
  queue?: string | null;
  data?: Record<string, unknown>;
}

export type NarrativeTaskStartResult =
  | NarrativeTaskResult
  | NarrativeErrorResult;

export interface EpisodeUpdatePayload {
  title?: string;
  summary?: string;
  content_summary?: string;
  character_names?: string[];
  key_events?: string[];
  cliffhanger?: string;
  identity_ids?: string[];
  beat_source_text?: string;
  identity_default_map?: Record<string, string>;
}

export interface PlanIdentitiesResult {
  new_count: number;
  resolved_count: number;
  identities: {
    character_name: string;
    identity_id: string;
    identity_name: string;
    appearance_details: string;
  }[];
  episode?: Episode;
  logs?: string[];
}

export interface PlanEpisodeAssetsResult {
  kind: "scene" | "prop";
  total_count: number;
  new_count?: number;
  auto_promoted_props?: string[];
  scene_menu?: EpisodeSceneMenuItem[];
  prop_menu?: EpisodePropMenuItem[];
  episode: Episode;
  logs?: string[];
}

export type PlanEpisodeAssetsResponse =
  | DataResponse<PlanEpisodeAssetsResult>
  | (NarrativeTaskResult & {
      data?: {
        target_episode?: number;
        asset_kind?: "scene" | "prop";
      };
    })
  | NarrativeErrorResult;

export interface InsertManualShotParams {
  after_beat_number: number | null;
  visual_description: string;
  duration_seconds?: number | null;
  scene_ref?: { scene_id: string; variant_id?: string } | null;
  time_of_day?: string | null;
  detected_identities?: string[] | null;
  detected_props?: string[] | null;
  audio_type?: "silence" | "narration" | "dialogue";
  speaker?: string | null;
  narration_segment?: string | null;
}

export interface GenerateScriptParams {
  target_duration_total?: number;
  rhythm?: "duration" | "literal";
}

export interface GenerateRewriteParams {
  target_beats?: number;
  beat_chars_min?: number;
  beat_chars_max?: number;
  narration_style?: string;
}

export interface GeneratedRewrite {
  episode: number;
  line_count: number;
  adapted_content: string;
  used_fallback: boolean;
}

export interface NarrativePlanningGateway {
  listEpisodes(
    project: string,
    signal?: AbortSignal,
  ): Promise<DataResponse<Episode[]>>;
  getPipelineStatus(
    project: string,
    signal?: AbortSignal,
  ): Promise<DataResponse<PipelineStatus>>;
  planEpisodes(
    project: string,
    params?: { target_episodes?: number; planning_mode?: string },
  ): Promise<NarrativeTaskStartResult>;
  updateEpisode(
    project: string,
    episode: number,
    data: EpisodeUpdatePayload,
  ): Promise<DataResponse<Episode>>;
  planIdentities(
    project: string,
    episode: number,
  ): Promise<NarrativeTaskStartResult>;
  planEpisodeAssets(
    project: string,
    episode: number,
    kind: "scene" | "prop",
  ): Promise<PlanEpisodeAssetsResponse>;
  getEpisode(
    project: string,
    episode: number,
    signal?: AbortSignal,
  ): Promise<DataResponse<Episode>>;
  getBeats(
    project: string,
    episode: number,
    signal?: AbortSignal,
  ): Promise<DataResponse<Beat[]>>;
  insertManualShot(
    project: string,
    episode: number,
    data: InsertManualShotParams,
  ): Promise<DataResponse<Beat> | NarrativeErrorResult>;
  deleteManualShot(
    project: string,
    episode: number,
    beat: number,
  ): Promise<DataResponse<{ beats: Beat[] }> | NarrativeErrorResult>;
  getScript(
    project: string,
    episode: number,
    signal?: AbortSignal,
  ): Promise<DataResponse<Script | null>>;
  generateScript(
    project: string,
    episode: number,
    params?: GenerateScriptParams,
  ): Promise<NarrativeTaskStartResult>;
  generateRewrite(
    project: string,
    episode: number,
    params?: GenerateRewriteParams,
  ): Promise<NarrativeTaskStartResult>;
  updateBeat(
    project: string,
    episode: number,
    beat: number,
    data: BeatUpdate,
  ): Promise<DataResponse<Beat>>;
  saveScript(
    project: string,
    episode: number,
    beats: Beat[],
  ): Promise<DataResponse<{ episode: number; beats_count: number }>>;
}
