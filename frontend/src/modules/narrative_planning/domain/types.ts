// Copyright (c) 2026 AI anime
export interface SceneRef {
  scene_id: string;
  variant_id?: string;
}

export interface EpisodeSceneMenuItem {
  scene_id: string;
  base_scene_id?: string;
  variant_id?: string;
  time_of_day?: string;
}

export interface EpisodePropMenuItem {
  prop_id: string;
  prop_type?: string;
  visual_prompt?: string;
  description?: string;
  owner_identity_id?: string;
  marker_color?: string;
}

export interface Episode {
  number: number;
  title: string;
  summary?: string;
  raw_content?: string;
  beat_source_text?: string;
  content_summary?: string;
  character_names?: string[];
  key_events?: string[];
  cliffhanger?: string;
  identity_ids?: string[];
  identity_default_map?: Record<string, string>;
  scene_menu?: EpisodeSceneMenuItem[];
  prop_menu?: EpisodePropMenuItem[];
}

export interface Beat {
  beat_index?: number;
  beat_number: number;
  narration_segment: string;
  visual_description: string;
  scene_ref?: SceneRef | null;
  location?: string;
  location_description?: string;
  time_of_day?: string;
  speaker?: string;
  audio_type?: string;
  video_prompt?: string;
  keyframe_prompt?: string;
  video_mode?: string;
  video_config_json?: string;
  estimated_duration?: number;
  detected_identities?: string[];
  detected_props?: string[];
  is_manual_shot?: boolean;
  sketch_url?: string | null;
  frame_url?: string | null;
  video_url?: string | null;
  audio_url?: string | null;
  audio_duration_seconds?: number | null;
}

export interface Script {
  beats: Beat[];
  review_summary?: string;
  sketch_colors?: Record<string, string>;
}

export interface BeatUpdate {
  narration_segment?: string;
  visual_description?: string;
  scene_ref?: SceneRef | null;
  time_of_day?: string;
  video_prompt?: string;
  keyframe_prompt?: string;
  video_mode?: string;
  video_config_json?: string;
  audio_type?: string;
  speaker?: string;
  detected_identities?: string[];
  detected_props?: string[];
}

export interface PipelineEpisodeStatus {
  episode: number;
  script: boolean;
  sketch: boolean;
  audio: boolean;
  video: boolean;
  compose: boolean;
}

export interface PipelineProjectStatus {
  ingested: boolean;
  configured: boolean;
  characters: number;
  episodes: number;
  portraits_done: boolean;
}

export interface PipelineStepStatus {
  identity_plan?: boolean;
  identity_images?: boolean;
  script?: boolean;
  sketches?: boolean;
  coloring?: boolean;
  global_optimize?: boolean;
  first_frames?: boolean;
  tts?: boolean;
  video?: boolean;
}

export interface PipelineStatus {
  project: string;
  global: PipelineProjectStatus;
  current_episode: number | null;
  episode_status: PipelineStepStatus | null;
  next_step: string;
  next_step_name: string;
}
