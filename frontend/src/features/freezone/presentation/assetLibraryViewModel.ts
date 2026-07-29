// Copyright (c) 2026 AI anime
import {
  SCENE_DIRECTOR_WORLD_ROLE,
  type AssetTab,
  type CanvasKind,
  type LibraryAsset,
} from "../domain/assetLibraryModel";

const ROLE_LABELS: Record<string, string> = {
  current_sketch: "草图",
  current_frame: "分镜",
  current_video: "视频",
  current_audio: "音频",
  selected_background: "背景",
  director_combined: "导演合成图",
};

const ROLE_ORDER = [
  "current_sketch",
  "current_frame",
  "current_video",
  "director_combined",
  "selected_background",
];

export function beatAssetItems(
  assets: LibraryAsset[],
): Array<{ role: string; label: string; asset: LibraryAsset }> {
  const byRole = new Map<string, LibraryAsset>();
  for (const asset of assets) {
    if (ROLE_LABELS[asset.role]) byRole.set(asset.role, asset);
  }
  return ROLE_ORDER
    .filter((role) => byRole.has(role))
    .map((role) => ({
      role,
      label: ROLE_LABELS[role],
      asset: byRole.get(role)!,
    }));
}

export function sceneAssetTypeBadge(
  asset: LibraryAsset,
): { label: string; title: string; className: string } | null {
  if (asset.tab !== "scenes") return null;
  if (asset.role === "scene_master") {
    return {
      label: "正面图",
      title: "场景正面图",
      className: "border-primary/30 bg-primary/10 text-primary",
    };
  }
  if (asset.role === "scene_reverse_master") {
    return {
      label: "背面图",
      title: "场景背面图",
      className: "border-primary/30 bg-primary/10 text-primary",
    };
  }
  if (asset.role === "scene_director_pano_360") {
    return {
      label: "360图",
      title: "360 全景图",
      className: "border-warning/30 bg-warning/10 text-warning",
    };
  }
  if (asset.role === SCENE_DIRECTOR_WORLD_ROLE) {
    return {
      label: "导演世界",
      title: "场景导演世界",
      className: "border-secondary bg-secondary text-secondary-foreground",
    };
  }
  if (asset.role === "scene_3gs_master_ply") {
    return {
      label: "正面世界",
      title: "3D 导演世界（正面）",
      className: "border-secondary bg-secondary text-secondary-foreground",
    };
  }
  if (asset.role === "scene_3gs_reverse_ply") {
    return {
      label: "背面世界",
      title: "3D 导演世界（背面）",
      className: "border-secondary bg-secondary text-secondary-foreground",
    };
  }
  if (asset.role === "scene_3gs_pano_ply") {
    return {
      label: "360世界",
      title: "3D 导演世界（360）",
      className: "border-secondary bg-secondary text-secondary-foreground",
    };
  }
  if (asset.role === "scene_3gs_custom_scene") {
    return {
      label: "自定义世界",
      title: "3D 导演世界（自定义）",
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    };
  }
  return null;
}

export function groupBeatAssets(assets: LibraryAsset[]): Array<{
  id: string;
  label: string;
  assets: LibraryAsset[];
}> {
  const order = ["outputs", "director", "characters", "scenes", "props", "other"];
  const labels: Record<string, string> = {
    outputs: "当前产物",
    director: "3GS / 控制图",
    characters: "角色参考",
    scenes: "场景参考",
    props: "道具参考",
    other: "其他上下文",
  };
  const buckets = new Map<string, LibraryAsset[]>();
  for (const asset of assets) {
    const group = beatGroupForAsset(asset);
    buckets.set(group, [...(buckets.get(group) ?? []), asset]);
  }
  return order
    .map((id) => ({ id, label: labels[id], assets: buckets.get(id) ?? [] }))
    .filter((group) => group.assets.length > 0);
}

function beatGroupForAsset(asset: LibraryAsset): string {
  const kind = asset.kind;
  const role = asset.role;
  if (
    kind === "frame" ||
    kind === "sketch" ||
    kind === "director_render" ||
    kind === "video" ||
    kind === "audio" ||
    role.includes("frame") ||
    role.includes("sketch") ||
    role.includes("render") ||
    role.includes("video") ||
    role.includes("audio")
  ) {
    return "outputs";
  }
  if (
    kind === "director" ||
    role.includes("3gs") ||
    role.includes("control") ||
    role.includes("combined") ||
    role.includes("env") ||
    role.includes("mask")
  ) {
    return "director";
  }
  if (
    kind === "identity" ||
    kind === "identity_costume" ||
    kind === "identity_portrait" ||
    kind === "portrait" ||
    role.startsWith("character_")
  ) {
    return "characters";
  }
  if (kind === "scene" || kind === "scene_master" || kind === "scene_360") {
    return "scenes";
  }
  if (kind === "prop" || kind === "prop_ref") return "props";
  return "other";
}

export function countAssetsForTab(
  assets: LibraryAsset[],
  tab: AssetTab,
): number {
  if (tab === "beat") {
    return assets.filter((asset) => asset.source.from_beat_context).length;
  }
  return assets.filter((asset) => asset.tab === tab).length;
}

export function resolveCanvasKind(
  metadata: Record<string, unknown> | null,
): CanvasKind {
  const preset = metadata?.preset as { scope?: unknown } | undefined;
  const scope = typeof preset?.scope === "string" ? preset.scope : "";
  if (scope === "episode") return "episode";
  if (scope === "beat") return "beat";
  if (scope === "asset") return "asset";
  if (scope === "blank") return "blank";
  return "default";
}

export function resolveCurrentEpisode(
  metadata: Record<string, unknown> | null,
): number | null {
  const preset = metadata?.preset as { episode?: unknown } | undefined;
  if (typeof preset?.episode === "number") return preset.episode;
  const defaultTarget = metadata?.default_push_target as
    | { episode?: unknown }
    | null
    | undefined;
  if (typeof defaultTarget?.episode === "number") return defaultTarget.episode;
  return null;
}

export function resolveCurrentBeat(
  metadata: Record<string, unknown> | null,
): number | null {
  const preset = metadata?.preset as { beat?: unknown } | undefined;
  if (typeof preset?.beat === "number") return preset.beat;
  const defaultTarget = metadata?.default_push_target as
    | { beat?: unknown }
    | null
    | undefined;
  if (typeof defaultTarget?.beat === "number") return defaultTarget.beat;
  return null;
}
