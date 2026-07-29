// Copyright (c) 2026 AI anime
import type { MainlineContext } from "./mainlineContext";
import type { PushTarget } from "./assetCommit";

export type FreezoneAssetMediaType = "image" | "video" | "audio" | "text" | "file";

export interface FreezoneProjectAsset {
  id: string;
  tab: "beat" | "characters" | "scenes" | "props" | "director";
  kind: string;
  role: string;
  label: string;
  sublabel?: string;
  rel_path?: string;
  url?: string | null;
  exists?: boolean;
  media_type?: FreezoneAssetMediaType | string;
  aspect_ratio?: string;
  meta?: Record<string, unknown>;
  mainline_context?: MainlineContext[];
  /** Director combined assets carry the complete bundle, not only combined.png. */
  director_control_bundle?: Record<string, unknown> | null;
  /** Whether the backend considers this asset eligible for mainline commit. */
  pushable?: boolean;
  /** Canonical backend target; validate it with coerceSlotTarget before use. */
  slot_target?: PushTarget | null;
}

export interface FreezoneBeatContextBeat {
  episode: number;
  beat: number;
  label?: string;
  visual_description?: string;
  narration_segment?: string;
  scene_id?: string;
  scene_variant_id?: string;
  time_of_day?: string;
  detected_identities?: string[];
  detected_props?: string[];
  sketch_colors?: Record<string, string>;
  prop_marker_colors?: Record<string, string>;
  asset_count?: number;
  assets: FreezoneProjectAsset[];
}

export interface FreezoneBeatContextEpisode {
  episode: number;
  beats: FreezoneBeatContextBeat[];
}

export interface FreezoneBeatContextResponse {
  scope: {
    episode: number | null;
    beat: number | null;
  };
  episodes: FreezoneBeatContextEpisode[];
  assets: FreezoneProjectAsset[];
}
