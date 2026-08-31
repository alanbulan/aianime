// Copyright (c) 2026 AI anime
export interface SceneAsset {
  name: string;
  aliases?: string[];
  scene_type?: string;
  base_scene_id?: string;
  variant_id?: string;
  time_of_day?: string;
  environment_prompt?: string;
  variant_prompt?: string;
  effective_environment_prompt?: string;
  description?: string;
  derived_from_scene?: string;
  spatial_layout_image?: string;
  notes?: string;
  master_path?: string | null;
  master_url?: string | null;
  reverse_master_path?: string | null;
  reverse_master_url?: string | null;
  pano_path?: string | null;
  pano_url?: string | null;
  custom_scene_path?: string | null;
  custom_scene_url?: string | null;
  stage_3gs?: SceneStage3gsStatus;
}

export type ScenePanoSource = "master" | "text";

export type SceneStagePlySource = "master" | "reverse" | "pano";

export interface SceneStage3gsFile {
  ready: boolean;
  path: string;
  url: string;
  size_bytes: number;
  size_mb: number;
}

export interface SceneStage3gsStatus {
  stage_dir: string;
  manifest_ready: boolean;
  source: string;
  active_source: string;
  active: SceneStage3gsFile;
  custom: SceneStage3gsFile;
  master: SceneStage3gsFile;
  reverse: SceneStage3gsFile;
  pano: SceneStage3gsFile;
}

export interface ScenePlatePreview {
  scene_id: string;
  variant_id: string;
  time_of_day: string;
  resolved_scene_name: string;
  planned_scene_name: string;
  time_baked: boolean;
  render: {
    resolved_scene_name: string;
    planned_scene_name: string;
    relight: boolean;
    status: "no_time" | "time_baked" | "relight" | "planned_missing";
    label: string;
  };
  videoReference: {
    resolved_scene_name: string;
    prompt_time_of_day: string;
    label: string;
  };
}

export interface SceneGroup {
  baseName: string;
  scenes: SceneAsset[];
}

export function sceneGroupsFromAssets(
  scenes: readonly SceneAsset[],
): SceneGroup[] {
  const groups = new Map<string, SceneAsset[]>();
  for (const scene of scenes) {
    const baseName =
      scene.base_scene_id?.trim() ||
      scene.derived_from_scene?.trim() ||
      scene.name;
    const group = groups.get(baseName) ?? [];
    group.push(scene);
    groups.set(baseName, group);
  }
  return Array.from(groups, ([baseName, groupScenes]) => ({
    baseName,
    scenes: groupScenes,
  }));
}

export function composeScenePlateName(input: {
  base_scene_id?: string;
  variant_id?: string;
  time_of_day?: string;
}): string {
  return [input.base_scene_id, input.variant_id, input.time_of_day]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("_");
}

export function isScenePlate(
  input:
    | {
        base_scene_id?: string;
        derived_from_scene?: string;
        variant_id?: string;
        time_of_day?: string;
      }
    | null
    | undefined,
): boolean {
  if (!input) return false;
  return Boolean(
    input.base_scene_id?.trim() ||
      input.derived_from_scene?.trim() ||
      input.variant_id?.trim() ||
      input.time_of_day?.trim(),
  );
}
