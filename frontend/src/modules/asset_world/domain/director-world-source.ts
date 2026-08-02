// Copyright (c) 2026 AI anime
export type DirectorWorldSourceType = "sog" | "pano360" | "mesh";
export type DirectorWorldSourceKind =
  | "active"
  | "master"
  | "reverse"
  | "pano"
  | "uploaded"
  | "custom";

export interface DirectorWorldSourceDescriptor {
  id?: string;
  source_type: DirectorWorldSourceType;
  source_kind?: DirectorWorldSourceKind;
  label?: string;
  ply_url?: string;
  url?: string;
  pano_url?: string;
  pano_fs?: string;
  collision_glb_url?: string;
  slot_kind?: "scene_director_pano_360" | "scene_360_candidate";
  fs?: string;
  current?: boolean;
}

export function directorSourceIdentityUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const withoutHash = trimmed.split("#", 1)[0] ?? "";
  return withoutHash.split("?", 1)[0] ?? "";
}
