// Copyright (c) 2026 AI anime
import type { DropMediaType } from "@/features/canvas/domain/assetDropInfo";
import { directorSourceIdentityUrl } from "@/features/canvas/domain/directorWorldSources";
import type { MainlineContext } from "@/features/freezone/context/mainlineContext";
import type { DirectorWorldSource } from "@/features/viewer-kit/three-d/directorManifest";

export type AssetTab = "beat" | "characters" | "scenes" | "props";
export type CanvasKind = "default" | "episode" | "beat" | "asset" | "blank";
export type AssetMediaType = "image" | "video" | "audio" | "text" | "file" | "unknown";

export interface PresetReference {
  kind?: string;
  role?: string;
  label?: string;
  rel_path?: string | null;
  url?: string | null;
  exists?: boolean;
  media_type?: string;
  aspect_ratio?: string;
  meta?: Record<string, unknown>;
  mainline_context?: MainlineContext[];
}

export interface LibraryAsset {
  id: string;
  tab: AssetTab;
  kind: string;
  role: string;
  label: string;
  sublabel?: string;
  url: string;
  aspectRatio: string;
  mediaType: AssetMediaType;
  source: Record<string, unknown>;
  mainlineContext?: MainlineContext[];
  beatContext?: MainlineContext & { episode: number; beat: number };
  coverUrl?: string;
}

export const SCENE_DIRECTOR_WORLD_ROLE = "scene_director_world";

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function directorControlBundleFromAssetSource(
  source: Record<string, unknown>,
): Record<string, unknown> | null {
  const explicit = recordValue(source.director_control_bundle);
  if (explicit) return explicit;

  const role = stringValue(source.role);
  const relPath = stringValue(source.rel_path);
  const url = stringValue(source.url);
  if (role !== "director_combined" || !relPath.endsWith("/combined.png") || !url) {
    return null;
  }
  const relBase = relPath.slice(0, -"/combined.png".length);
  const urlBase = url.endsWith("/combined.png")
    ? url.slice(0, -"/combined.png".length)
    : "";
  if (!urlBase) return null;
  return {
    schema_version: "director_control_bundle_v1",
    rel_paths: {
      combined: `${relBase}/combined.png`,
      env_only: `${relBase}/env_only.png`,
      frame_meta: `${relBase}/frame_meta.json`,
    },
    urls: {
      combined: `${urlBase}/combined.png`,
      env_only: `${urlBase}/env_only.png`,
      frame_meta: `${urlBase}/frame_meta.json`,
    },
  };
}

export function assetDropMediaType(asset: LibraryAsset): DropMediaType | null {
  if (isThreeDAsset(asset)) return "model";
  if (asset.mediaType === "image") return "image";
  if (asset.mediaType === "video") return "video";
  if (asset.mediaType === "audio") return "audio";
  return null;
}

export function isThreeDAsset(asset: LibraryAsset): boolean {
  const role = asset.role || "";
  const kind = asset.kind || "";
  if (role === SCENE_DIRECTOR_WORLD_ROLE) return true;
  if (role.startsWith("scene_3gs_")) return true;
  const relPath = typeof asset.source.rel_path === "string" ? asset.source.rel_path : "";
  if (asset.mediaType === "file" && /\.(ply|glb)$/i.test(relPath)) return true;
  return kind === "director" && /\.(ply|glb)$/i.test(asset.url || "");
}

export function finalizeDirectorWorldAssets(
  assets: LibraryAsset[],
): LibraryAsset[] {
  attachThreeDCovers(assets);
  return coalesceSceneDirectorWorldAssets(assets);
}

function attachThreeDCovers(assets: LibraryAsset[]): void {
  const sceneRolePriority: Record<string, number> = {
    scene_master: 0,
    scene_reverse_master: 1,
    scene_director_pano_360: 2,
  };
  const bySceneId = new Map<string, { url: string; priority: number }>();
  for (const asset of assets) {
    if (asset.mediaType !== "image") continue;
    const sceneId = stringValue(recordValue(asset.source.meta)?.scene_id);
    if (!sceneId) continue;
    const priority = sceneRolePriority[asset.role] ?? 99;
    const existing = bySceneId.get(sceneId);
    if (!existing || priority < existing.priority) {
      bySceneId.set(sceneId, { url: asset.url, priority });
    }
  }
  for (const asset of assets) {
    if (asset.coverUrl || !isThreeDAsset(asset)) continue;
    const sceneId = stringValue(recordValue(asset.source.meta)?.scene_id);
    if (!sceneId) continue;
    const cover = bySceneId.get(sceneId);
    if (cover) asset.coverUrl = cover.url;
  }
}

function coalesceSceneDirectorWorldAssets(assets: LibraryAsset[]): LibraryAsset[] {
  const grouped = new Map<string, LibraryAsset[]>();
  for (const asset of assets) {
    if (!isSceneDirectorWorldSourceRole(asset.role)) continue;
    const sceneId = sceneIdForLibraryAsset(asset);
    if (!sceneId) continue;
    const group = grouped.get(sceneId) ?? [];
    group.push(asset);
    grouped.set(sceneId, group);
  }
  if (grouped.size === 0) return assets;

  const emittedScenes = new Set<string>();
  const next: LibraryAsset[] = [];
  for (const asset of assets) {
    const sceneId = sceneIdForLibraryAsset(asset);
    if (sceneId && grouped.has(sceneId) && isSceneDirectorWorldSourceRole(asset.role)) {
      if (!emittedScenes.has(sceneId)) {
        emittedScenes.add(sceneId);
        const bundled = createSceneDirectorWorldAsset(
          sceneId,
          grouped.get(sceneId) ?? [],
          assets.filter((candidate) => sceneIdForLibraryAsset(candidate) === sceneId),
        );
        if (bundled) next.push(bundled);
      }
      continue;
    }
    next.push(asset);
  }
  return next;
}

function createSceneDirectorWorldAsset(
  sceneId: string,
  sourceAssets: LibraryAsset[],
  sceneAssets: LibraryAsset[],
): LibraryAsset | null {
  const rawSources = sourceAssets
    .map((asset) => directorWorldSourceFromSceneAsset(sceneId, asset))
    .filter((source): source is DirectorWorldSource => source !== null);
  if (rawSources.length === 0) return null;

  const activeSource =
    rawSources.find((source) => source.current) ??
    rawSources.find((source) => source.source_type === "sog") ??
    rawSources[0];
  const hasCurrentSource = rawSources.some((candidate) => candidate.current);
  const sources = rawSources.map((source) => ({
    ...source,
    current: hasCurrentSource ? source.current : source.id === activeSource?.id,
  }));
  const cover =
    sceneCoverAsset(sceneAssets)?.url ??
    sourceAssets.find((asset) => asset.coverUrl)?.coverUrl ??
    sourceAssets.find((asset) => asset.mediaType === "image")?.url;
  const representative =
    sourceAssets.find((asset) => asset.url === directorWorldSourceUrl(activeSource)) ??
    sourceAssets[0];
  const sceneLabel = sceneLabelForLibraryAsset(representative, sceneId);
  const mainlineContext = sceneMainlineContext(sceneAssets, representative, sceneId);
  const meta = {
    ...(recordValue(representative.source.meta) ?? {}),
    scene_id: sceneId,
    scene: sceneLabel,
    source_count: sources.length,
  };

  return {
    id: `scene-director-world:${sceneId}`,
    tab: "scenes",
    kind: "director",
    role: SCENE_DIRECTOR_WORLD_ROLE,
    label: `${sceneLabel} / 导演世界`,
    sublabel: `包含 ${sources.length} 个导演源`,
    url: directorWorldSourceUrl(activeSource) ?? representative.url,
    aspectRatio: "1:1",
    mediaType: "file",
    coverUrl: cover,
    mainlineContext,
    source: {
      ...representative.source,
      kind: "director",
      role: SCENE_DIRECTOR_WORLD_ROLE,
      label: `${sceneLabel} / 导演世界`,
      meta,
      media_type: "file",
      rel_path: undefined,
      slot_target: undefined,
      pushable: false,
      director_world_sources: sources,
      active_source_id: activeSource?.id,
      mainline_context: mainlineContext,
    },
  };
}

function isSceneDirectorWorldSourceRole(role: string | undefined): boolean {
  return (
    role === "scene_director_pano_360" ||
    role === "scene_3gs_master_ply" ||
    role === "scene_3gs_reverse_ply" ||
    role === "scene_3gs_pano_ply" ||
    role === "scene_3gs_custom_scene"
  );
}

function sceneIdForLibraryAsset(asset: LibraryAsset): string | null {
  const meta = recordValue(asset.source.meta);
  return stringValue(meta?.scene_id) || stringValue(asset.source.scene_id) || null;
}

function sceneLabelForLibraryAsset(asset: LibraryAsset, sceneId: string): string {
  const meta = recordValue(asset.source.meta);
  return stringValue(meta?.scene) || stringValue(meta?.scene_name) || sceneId;
}

function sceneMainlineContext(
  sceneAssets: LibraryAsset[],
  representative: LibraryAsset,
  sceneId: string,
): MainlineContext[] {
  const existing =
    sceneAssets.find((asset) => asset.mainlineContext?.length)?.mainlineContext ??
    representative.mainlineContext;
  const sceneContext = existing?.find(
    (context) => context.kind === "scene" && context.sceneId === sceneId,
  );
  if (sceneContext) return [sceneContext];
  return [{
    kind: "scene",
    projectId: stringValue(representative.source.projectId),
    sceneId,
    role: SCENE_DIRECTOR_WORLD_ROLE,
    label: sceneLabelForLibraryAsset(representative, sceneId),
    sourceUrl: representative.url,
  }];
}

function sceneCoverAsset(sceneAssets: LibraryAsset[]): LibraryAsset | null {
  return (
    sceneAssets.find((asset) => asset.role === "scene_master" && asset.mediaType === "image") ??
    sceneAssets.find((asset) => asset.role === "scene_reverse_master" && asset.mediaType === "image") ??
    sceneAssets.find((asset) =>
      asset.role === "scene_director_pano_360" && asset.mediaType === "image") ??
    null
  );
}

function directorWorldSourceFromSceneAsset(
  sceneId: string,
  asset: LibraryAsset,
): DirectorWorldSource | null {
  const sourceType = asset.role === "scene_director_pano_360" ? "pano360" : "sog";
  const sourceKind = sceneDirectorSourceKind(asset.role);
  const url = asset.url;
  if (!sourceKind || !url) return null;
  const id = sourceType === "pano360"
    ? `scene-pano:${sceneId}`
    : `legacy:${sourceKind}:${sourceType}:${directorSourceIdentityUrl(url)}`;
  return {
    id,
    source_type: sourceType,
    source_kind: sourceKind,
    label: sourceKindLabel({ source_kind: sourceKind, source_type: sourceType }),
    url,
    ply_url: sourceType === "sog" ? url : undefined,
    pano_url: sourceType === "pano360" ? url : undefined,
    slot_kind: sourceType === "pano360" ? "scene_director_pano_360" : undefined,
    current: Boolean(recordValue(asset.source.meta)?.current),
  };
}

function sceneDirectorSourceKind(
  role: string,
): NonNullable<DirectorWorldSource["source_kind"]> | null {
  if (role === "scene_3gs_master_ply") return "master";
  if (role === "scene_3gs_reverse_ply") return "reverse";
  if (role === "scene_3gs_pano_ply") return "pano";
  if (role === "scene_3gs_custom_scene") return "custom";
  if (role === "scene_director_pano_360") return "pano";
  return null;
}

function directorWorldSourceUrl(source: DirectorWorldSource | undefined): string | null {
  return source?.ply_url ?? source?.pano_url ?? source?.url ?? null;
}

function sourceKindLabel(
  source: Pick<DirectorWorldSource, "source_kind" | "source_type">,
): string {
  if (source.source_type === "pano360") return "360图";
  if (source.source_kind === "master") return "正面世界";
  if (source.source_kind === "reverse") return "背面世界";
  if (source.source_kind === "pano") return "360世界";
  if (source.source_kind === "custom") return "自定义世界";
  return "导演世界";
}
