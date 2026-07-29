// Copyright (c) 2026 AI anime
import type {
  PushTarget,
  PushTargetKind,
} from "@/features/freezone/domain/assetCommit";
import type { DropMediaType } from "@/features/canvas/domain/assetDropInfo";
import type { Identity, SceneAsset } from "@/modules/asset_world/public";

// Hidden kinds remain in the backend contract for legacy canvas data, but this
// dialog does not offer deprecated or derived slots for manual selection.
export const KIND_LABELS: Record<PushTargetKind, string> = {
  frame: "首帧",
  sketch: "草图",
  director_render: "导演合成资产",
  selected_background: "当前背景",
  identity: "角色身份图",
  identity_costume: "身份服装图",
  identity_portrait: "年龄身份肖像",
  portrait: "角色肖像",
  scene_master: "场景主图",
  scene_reverse_master: "反面场景图",
  scene_spatial_layout: "Scene Spatial Layout (空间布局图)",
  scene_360: "Scene 360 (DEPRECATED — use Director Pano 360)",
  scene_director_world: "导演世界",
  scene_director_pano_360: "Director Pano 360 (3GS 全景图)",
  scene_3gs_active_ply: "3D 世界（当前入口）",
  scene_3gs_master_ply: "3D 世界（正面）",
  scene_3gs_reverse_ply: "3D 世界（背面）",
  scene_3gs_pano_ply: "3D 世界（360）",
  scene_3gs_custom_scene: "3D 世界（自定义场景）",
  scene_3gs_collision_glb: "3D 世界碰撞体",
  prop_ref: "Prop Reference (道具参考)",
  video: "Video (beat 视频)",
  beat_audio: "Audio (beat 音频)",
};

const HIDDEN_KINDS = new Set<PushTargetKind>([
  "scene_360",
  "scene_spatial_layout",
  "scene_director_world",
  "scene_3gs_active_ply",
  "scene_3gs_collision_glb",
]);

export function isUserSelectableCommitKind(kind: PushTargetKind): boolean {
  return kind !== "video" && kind !== "beat_audio" && !HIDDEN_KINDS.has(kind);
}

export const GLOBAL_SLOT_KINDS = new Set<PushTargetKind>([
  "identity",
  "identity_costume",
  "identity_portrait",
  "portrait",
  "scene_master",
  "scene_reverse_master",
  "scene_spatial_layout",
  "scene_director_pano_360",
  "scene_3gs_master_ply",
  "scene_3gs_reverse_ply",
  "scene_3gs_pano_ply",
  "scene_3gs_custom_scene",
  "prop_ref",
]);

export const BEAT_SLOT_KINDS: PushTargetKind[] = [
  "frame",
  "sketch",
  "director_render",
  "selected_background",
];

export const SCENE_SLOT_KINDS = new Set<PushTargetKind>([
  "scene_master",
  "scene_reverse_master",
  "scene_spatial_layout",
  "scene_director_world",
  "scene_director_pano_360",
  "scene_3gs_master_ply",
  "scene_3gs_reverse_ply",
  "scene_3gs_pano_ply",
  "scene_3gs_custom_scene",
]);

const MODEL_WORLD_SLOT_KINDS: PushTargetKind[] = [
  "scene_3gs_master_ply",
  "scene_3gs_reverse_ply",
  "scene_3gs_pano_ply",
  "scene_3gs_custom_scene",
];

const MODEL_PANO_SLOT_KINDS: PushTargetKind[] = [
  "scene_director_pano_360",
];
const EMPTY_DIRECTOR_WORLD_SOURCE_ID = "__empty_director_world__";

export function modelSlotKindsForNodeData(
  nodeData: Record<string, unknown> | null | undefined,
  sourceUrl: string,
): PushTargetKind[] {
  const sources = directorWorldSources(nodeData);
  const activeSourceId = stringValue(nodeData?.activeSourceId);
  if (activeSourceId === EMPTY_DIRECTOR_WORLD_SOURCE_ID) {
    return [];
  }
  const activeSource =
    sources.find((source) => stringValue(source.id) === activeSourceId) ??
    sources.find((source) => sourceUrlFromRecord(source) === sourceUrl) ??
    sources[0];
  if (activeSourceId && !sourceUrlFromRecord(activeSource ?? {})) {
    return [];
  }
  if (stringValue(activeSource?.source_type) === "pano360") {
    return MODEL_PANO_SLOT_KINDS;
  }
  if (stringValue(nodeData?.panoUrl) && !stringValue(nodeData?.plyUrl)) {
    return MODEL_PANO_SLOT_KINDS;
  }
  return MODEL_WORLD_SLOT_KINDS;
}

export function identityOptionValue(identity: Identity): string {
  const value = identity.identity_id || identity.id || identity.name || "";
  return String(value).trim();
}

export function identityOptionLabel(identity: Identity): string {
  const value = identityOptionValue(identity);
  const displayName = String(identity.identity_name || identity.name || "").trim();
  if (displayName && displayName !== value) {
    return `${displayName} · ${value}`;
  }
  return value;
}

export function firstIdentityOptionValue(identities: Identity[]): string | null {
  for (const identity of identities) {
    const value = identityOptionValue(identity);
    if (value) return value;
  }
  return null;
}

export function sceneOptionValue(scene: SceneAsset | undefined): string {
  return typeof scene?.name === "string" && scene.name.trim()
    ? scene.name.trim()
    : "";
}

export function sceneOptionLabel(scene: SceneAsset): string {
  return sceneOptionValue(scene);
}

export function renderMediaLabel(mediaType: DropMediaType): string {
  if (mediaType === "video") return "视频";
  if (mediaType === "audio") return "音频";
  if (mediaType === "model") return "3D 模型";
  return "图片";
}

export function directorWorldSourceDisplayName(
  nodeData: Record<string, unknown> | null | undefined,
  sourceUrl: string,
  fallback: string,
): string {
  const source = activeDirectorWorldSource(nodeData, sourceUrl);
  const label = stringValue(source?.label);
  if (label) return label;
  const sourceKind = stringValue(source?.source_kind);
  if (sourceKind === "master") return "正面 3D 世界";
  if (sourceKind === "reverse") return "背面 3D 世界";
  if (sourceKind === "pano") {
    return source?.source_type === "pano360" ? "360 图" : "360 3D 世界";
  }
  if (sourceKind === "custom") return "自定义 3D 世界";
  if (sourceKind === "uploaded") return "上传 3D 世界";
  if (stringValue(source?.source_type) === "pano360") return "360 图";
  return fallback && !looksLikeAssetFilename(fallback) ? fallback : "3D 世界";
}

export function identityOptionsForSelect(
  identities: Identity[],
  currentIdentityId: string | null,
): Identity[] {
  const options = identities.filter((identity) => identityOptionValue(identity));
  if (
    currentIdentityId &&
    !options.some((identity) => identityOptionValue(identity) === currentIdentityId)
  ) {
    return [
      {
        id: currentIdentityId,
        identity_id: currentIdentityId,
        identity_name: currentIdentityId,
      },
      ...options,
    ];
  }
  return options;
}

export function buildCommitTarget(
  kind: PushTargetKind,
  episode: number | null,
  beat: number | null,
  character: string | null,
  identityId: string | null,
  sceneId: string,
  propId: string,
): PushTarget | null {
  if (
    kind === "frame" ||
    kind === "sketch" ||
    kind === "director_render" ||
    kind === "selected_background" ||
    kind === "video" ||
    kind === "beat_audio"
  ) {
    if (episode === null || beat === null) return null;
    return { kind, episode, beat };
  }
  if (
    kind === "identity" ||
    kind === "identity_costume" ||
    kind === "identity_portrait"
  ) {
    if (!character || !identityId) return null;
    return { kind, character, identity_id: identityId };
  }
  if (kind === "portrait") {
    if (!character) return null;
    return { kind: "portrait", character };
  }
  if (SCENE_SLOT_KINDS.has(kind)) {
    const trimmed = sceneId.trim();
    if (!trimmed) return null;
    return { kind, scene_id: trimmed } as PushTarget;
  }
  if (kind === "prop_ref") {
    const trimmed = propId.trim();
    if (!trimmed) return null;
    return { kind: "prop_ref", prop_id: trimmed };
  }
  return null;
}

export function renderCommitTargetLabel(target: PushTarget): string {
  if (
    target.kind === "frame" ||
    target.kind === "sketch" ||
    target.kind === "director_render" ||
    target.kind === "selected_background" ||
    target.kind === "video" ||
    target.kind === "beat_audio"
  ) {
    return `EP${target.episode} / B${target.beat} / ${shortKindLabel(target.kind)}`;
  }
  if (target.kind === "identity") {
    return `${target.character} / ${target.identity_id} / Identity`;
  }
  if (target.kind === "identity_costume") {
    return `${target.character} / ${target.identity_id} / Identity Costume`;
  }
  if (target.kind === "identity_portrait") {
    return `${target.character} / ${target.identity_id} / Identity Portrait`;
  }
  if (target.kind === "portrait") return `${target.character} / Portrait`;
  if (SCENE_SLOT_KINDS.has(target.kind)) {
    return `${(target as unknown as Record<string, unknown>).scene_id} / ${shortKindLabel(target.kind)}`;
  }
  return `${(target as unknown as Record<string, unknown>).prop_id} / Prop Reference`;
}

export function shortKindLabel(kind: PushTargetKind): string {
  if (kind === "frame") return "首帧";
  if (kind === "sketch") return "草图";
  if (kind === "director_render") return "导演合成资产";
  if (kind === "selected_background") return "当前背景";
  if (kind === "video") return "视频";
  if (kind === "beat_audio") return "音频";
  if (kind === "identity") return "角色身份图";
  if (kind === "identity_costume") return "身份服装图";
  if (kind === "identity_portrait") return "年龄身份肖像";
  if (kind === "portrait") return "角色肖像";
  if (kind === "scene_master") return "场景主图";
  if (kind === "scene_reverse_master") return "反面场景图";
  if (kind === "scene_spatial_layout") return "Scene Spatial Layout";
  if (kind === "scene_360") return "Scene 360";
  if (kind === "scene_director_world") return "导演世界";
  if (kind === "scene_director_pano_360") return "Director Pano 360";
  if (kind === "scene_3gs_active_ply") return "3D 世界（当前入口）";
  if (kind === "scene_3gs_master_ply") return "3D 世界（正面）";
  if (kind === "scene_3gs_reverse_ply") return "3D 世界（背面）";
  if (kind === "scene_3gs_pano_ply") return "3D 世界（360）";
  if (kind === "scene_3gs_custom_scene") return "3D 世界（自定义场景）";
  if (kind === "scene_3gs_collision_glb") return "3D 世界碰撞体";
  return "道具参考";
}

function activeDirectorWorldSource(
  nodeData: Record<string, unknown> | null | undefined,
  sourceUrl: string,
): Record<string, unknown> | null {
  const sources = directorWorldSources(nodeData);
  const activeSourceId = stringValue(nodeData?.activeSourceId);
  return (
    (activeSourceId
      ? sources.find((source) => stringValue(source.id) === activeSourceId)
      : undefined) ??
    sources.find((source) => sourceUrlFromRecord(source) === sourceUrl) ??
    sources.find((source) => source.current === true) ??
    sources[0] ??
    null
  );
}

function directorWorldSources(
  nodeData: Record<string, unknown> | null | undefined,
): Record<string, unknown>[] {
  return Array.isArray(nodeData?.sources)
    ? nodeData.sources.filter((source): source is Record<string, unknown> =>
        Boolean(source && typeof source === "object"),
      )
    : [];
}

function sourceUrlFromRecord(source: Record<string, unknown>): string {
  for (const key of ["url", "ply_url", "pano_url", "fs", "pano_fs"]) {
    const value = stringValue(source[key]);
    if (value) return value;
  }
  return "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function looksLikeAssetFilename(value: string): boolean {
  return /\.[a-z0-9]{2,5}$/i.test(value.trim());
}
