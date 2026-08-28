// Copyright (c) 2026 AI anime

export interface Seedance2AssetItem {
  key: string;
  label: string;
  media_type: string;
  selected: boolean;
  exists: boolean;
  required?: boolean;
  state?: "sent" | "missing" | "invalid" | "unused" | "fallback";
  reference_label: string;
  note: string;
  status_detail?: string;
  identity_id?: string;
  path?: string;
  url?: string;
  abs_path?: string;
  crop_source_path?: string;
  crop_source_abs_path?: string;
  crop_source_url?: string;
  validation_error?: string;
  fallback_text?: string;
  can_crop?: boolean;
  can_trim?: boolean;
  can_delete?: boolean;
}

export interface Seedance2BeatStatus {
  beat_number: number;
  audio_type: string;
  seedance2_config_json: string;
  media: {
    render_ready: boolean;
    audio_ready: boolean;
    video_ready: boolean;
  };
  voice: {
    required: boolean;
    ready: boolean;
    label: string;
    detail: string;
    speaker?: string;
  };
  prompt: {
    ready: boolean;
    source: string;
    status: string;
    has_guidance: boolean;
    text_overlay_enabled: boolean;
    text_overlay: Record<string, unknown>;
    inputs_stale: boolean;
  };
  assets: {
    total: number;
    selected: number;
    missing: number;
    invalid?: number;
    unused?: number;
    images: number;
    audios: number;
    fallbacks: number;
    items: Seedance2AssetItem[];
  };
}

export type VideoInputCropTarget =
  | "reference_image"
  | "first_frame"
  | "last_frame";
