// Copyright (c) 2026 AI anime

export const DEFAULT_VIDEO_BACKEND = "huimeng_seedance-1.0-pro-fast";

export interface VideoBackendOption {
  value: string;
  label: string;
  is_default: boolean;
  is_seedance2: boolean;
  is_happyhorse?: boolean;
  is_grok_video?: boolean;
  dialogue_only: boolean;
  min_duration?: number | null;
  max_duration?: number | null;
  resolution_options?: string[] | null;
  ratio_options?: string[] | null;
  supported_modes?: string[] | null;
  reference_image_max?: number | null;
  reference_video_max?: number | null;
  reference_audio_max?: number | null;
}
