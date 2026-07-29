// Copyright (c) 2026 AI anime
import type { MainlineContext } from "../domain/mainlineContext";
import {
  directorControlBundleFromAssetSource,
  finalizeDirectorWorldAssets,
  SCENE_DIRECTOR_WORLD_ROLE,
  type AssetMediaType,
  type AssetTab,
  type CanvasKind,
  type LibraryAsset,
  type PresetReference,
} from "../domain/assetLibraryModel";
import type {
  FreezoneBeatContextBeat,
  FreezoneBeatContextResponse,
  FreezoneProjectAsset,
} from "../domain/beatContext";

const BEAT_SCOPED_LIBRARY_ASSET_ROLES = new Set([
  "current_sketch",
  "current_frame",
  "current_video",
  "current_audio",
  "selected_background",
  "director_combined",
]);

const BEAT_SCOPED_LIBRARY_ASSET_KINDS = new Set(["video", "audio"]);

export function buildLibraryAssets({
  project,
  metadata,
  projectAssets,
  beatContext,
  canvasKind,
}: {
  project: string;
  metadata: Record<string, unknown> | null;
  projectAssets: FreezoneProjectAsset[];
  beatContext: FreezoneBeatContextResponse | null;
  canvasKind: CanvasKind;
}): LibraryAsset[] {
  const out: LibraryAsset[] = [];
  const seen = new Set<string>();

  const groupedBeatAssets = beatContext?.episodes.flatMap((episode) =>
    episode.beats.flatMap((beat) =>
      beat.assets.map((asset) => ({ asset, beat })),
    ),
  ) ?? [];
  if (groupedBeatAssets.length > 0) {
    for (const { asset, beat } of groupedBeatAssets) {
      if (!isUsableAsset(asset)) continue;
      addUnique(
        out,
        seen,
        fromFreezoneAsset(asset, {
          fromBeatContext: true,
          projectId: project,
          beatContext: beatContextFromBeat(project, beat),
        }),
      );
    }
  } else {
    for (const asset of beatContext?.assets ?? []) {
      if (!isUsableAsset(asset)) continue;
      addUnique(
        out,
        seen,
        fromFreezoneAsset(asset, {
          fromBeatContext: true,
          projectId: project,
        }),
      );
    }
  }
  if (canvasKind !== "default") {
    const refs = Array.isArray(metadata?.references)
      ? (metadata.references as PresetReference[])
      : [];
    for (const ref of refs) {
      if (!ref?.url || ref.exists === false) continue;
      if (!isMainlinePresetReference(ref)) continue;
      if (isSceneAuxiliaryRole(ref.role)) continue;
      if (refIsFreezonePath(ref)) continue;
      addUnique(out, seen, fromPresetReference(ref));
    }
  }

  for (const asset of projectAssets) {
    if (!isUsableAsset(asset)) continue;
    addUnique(
      out,
      seen,
      fromFreezoneAsset(asset, {
        fromBeatContext: false,
        projectId: project,
      }),
    );
  }
  return finalizeDirectorWorldAssets(out);
}

function isUsableAsset(asset: FreezoneProjectAsset): boolean {
  if (!asset.url) return false;
  if (asset.exists === false) return false;
  if (isSceneAuxiliaryRole(asset.role)) return false;
  if (typeof asset.rel_path === "string" && asset.rel_path.startsWith("freezone/")) {
    return isDirectorControlRef(asset.role, asset.rel_path);
  }
  return true;
}

function isSceneAuxiliaryRole(role: string | undefined): boolean {
  // scene_360 is the direct-pano slot. The library surfaces its canonical
  // director-world counterpart as scene_director_pano_360 instead.
  return (
    role === "scene_360" ||
    role === "scene_3gs_active_ply" ||
    role === "scene_3gs_collision_glb"
  );
}

function refIsFreezonePath(ref: PresetReference): boolean {
  const relPath = typeof ref.rel_path === "string" ? ref.rel_path : "";
  return relPath.startsWith("freezone/") && !isDirectorControlRef(ref.role, relPath);
}

function isDirectorControlRef(
  role: string | undefined,
  relPath: string | undefined | null,
): boolean {
  if (typeof relPath !== "string") return false;
  const validPath =
    relPath.startsWith("director_control_frames/ep") ||
    relPath.startsWith("freezone/director_control_frames/ep");
  if (!validPath) return false;
  if (role === "director_combined") return relPath.endsWith("/combined.png");
  return role === "selected_background" && relPath.endsWith("/selected_background.png");
}

function isBeatOutputRole(role: string | undefined): boolean {
  return (
    role === "director_combined" ||
    role === "selected_background" ||
    role === "current_sketch" ||
    role === "current_frame" ||
    role === "current_video" ||
    role === "current_audio"
  );
}

function isSceneAssetRole(role: string | undefined): boolean {
  const normalized = role || "";
  return (
    normalized === "scene_master" ||
    normalized === "scene_reverse_master" ||
    normalized === "scene_spatial_layout" ||
    normalized === SCENE_DIRECTOR_WORLD_ROLE ||
    normalized === "scene_director_pano_360" ||
    (normalized.startsWith("scene_3gs_") && !isSceneAuxiliaryRole(normalized))
  );
}

function isMainlinePresetReference(ref: PresetReference): boolean {
  const role = ref.role || "";
  const kind = ref.kind || "";
  const relPath = ref.rel_path || "";
  if (kind === "director") {
    return isDirectorControlRef(role, relPath);
  }
  return (
    role === "current_sketch" ||
    role === "current_frame" ||
    role === "current_video" ||
    role === "current_audio"
  );
}

function tabForFreezoneAsset(asset: FreezoneProjectAsset): AssetTab {
  if (isBeatOutputRole(asset.role)) return "beat";
  if (asset.kind === "director" || asset.tab === "director") {
    return isSceneAssetRole(asset.role) ? "scenes" : "beat";
  }
  return asset.tab;
}

function fromFreezoneAsset(
  asset: FreezoneProjectAsset,
  flags: {
    fromBeatContext: boolean;
    projectId: string;
    beatContext?: MainlineContext & { episode: number; beat: number };
  },
): LibraryAsset {
  const meta = (asset.meta ?? {}) as Record<string, unknown>;
  const directorControlBundle = directorControlBundleFromAssetSource({
    kind: asset.kind,
    role: asset.role,
    rel_path: asset.rel_path,
    url: asset.url,
    director_control_bundle: asset.director_control_bundle ?? meta.director_control_bundle,
  });
  // v2 classifies 3GS as scenes while legacy payloads can still use the director tab.
  const normalizedTab = tabForFreezoneAsset(asset);
  const label = normalizeMainlineAssetLabel(asset.label, asset.role);
  return {
    id: asset.id || asset.rel_path || (asset.url as string),
    tab: normalizedTab,
    kind: asset.kind,
    role: asset.role,
    label,
    sublabel: asset.sublabel || asset.rel_path,
    url: asset.url as string,
    aspectRatio: asset.aspect_ratio || "1:1",
    mediaType: normalizeMediaType(asset.media_type, asset.kind),
    mainlineContext: asset.mainline_context,
    beatContext: flags.beatContext,
    source: {
      kind: asset.kind,
      role: asset.role,
      label,
      rel_path: asset.rel_path,
      media_type: asset.media_type,
      meta,
      projectId: flags.projectId,
      episode: typeof meta.episode === "number" ? meta.episode : undefined,
      beat: typeof meta.beat === "number" ? meta.beat : undefined,
      beat_context: flags.beatContext,
      from_beat_context: flags.fromBeatContext,
      mainline_context: asset.mainline_context,
      ...(directorControlBundle ? { director_control_bundle: directorControlBundle } : {}),
      slot_target: asset.slot_target ?? undefined,
      pushable: asset.pushable,
    },
  };
}

function beatContextFromBeat(
  project: string,
  beat: FreezoneBeatContextBeat,
): MainlineContext & { episode: number; beat: number } {
  return {
    kind: "beat",
    projectId: project,
    episode: beat.episode,
    beat: beat.beat,
    role: "beat_context",
    label: beat.label || `EP${beat.episode} / Beat ${beat.beat}`,
    visualDescription: beat.visual_description ?? "",
    narrationSegment: beat.narration_segment ?? "",
    sceneId: beat.scene_id ?? "",
    detectedIdentities: beat.detected_identities ?? [],
    detectedProps: beat.detected_props ?? [],
    sketchColors: beat.sketch_colors ?? {},
    propMarkerColors: beat.prop_marker_colors ?? {},
  };
}

function fromPresetReference(ref: PresetReference): LibraryAsset {
  const tab = tabForRef(ref);
  const label = normalizeMainlineAssetLabel(
    ref.label || ref.role || ref.kind || "reference",
    ref.role || "",
  );
  return {
    id: ref.rel_path || (ref.url as string),
    tab,
    kind: ref.kind || "reference",
    role: ref.role || "reference",
    label,
    sublabel: ref.rel_path || undefined,
    url: ref.url as string,
    aspectRatio: ref.aspect_ratio || aspectForRef(ref),
    mediaType: normalizeMediaType(ref.media_type, ref.kind),
    mainlineContext: ref.mainline_context,
    source: {
      kind: ref.kind || "reference",
      role: ref.role || "reference",
      label,
      rel_path: ref.rel_path || undefined,
      media_type: ref.media_type,
      meta: ref.meta || {},
      from_beat_context: tab === "beat",
      from_preset_reference: true,
      mainline_context: ref.mainline_context,
    },
  };
}

function normalizeMainlineAssetLabel(label: string, role: string | undefined): string {
  if (role === "current_frame") return "当前分镜";
  return replaceText(
    replaceText(
      replaceText(
        replaceText(
          replaceText(String(label || ""), "成图/首帧", "分镜"),
          "成图/分镜",
          "分镜",
        ),
        "成图首帧",
        "分镜",
      ),
      "当前成图",
      "当前分镜",
    ),
    "成图候选",
    "分镜候选",
  );
}

function replaceText(value: string, search: string, replacement: string): string {
  return value.split(search).join(replacement);
}

function normalizeMediaType(
  mediaType: string | undefined,
  kind: string | undefined,
): AssetMediaType {
  if (mediaType === "image" || mediaType === "video" || mediaType === "audio") {
    return mediaType;
  }
  if (mediaType === "text" || mediaType === "file") return mediaType;
  const normalizedKind = (kind || "").toLowerCase();
  if (normalizedKind.includes("video")) return "video";
  if (normalizedKind.includes("audio")) return "audio";
  if (
    normalizedKind.includes("frame") ||
    normalizedKind.includes("sketch") ||
    normalizedKind.includes("render") ||
    normalizedKind.includes("portrait") ||
    normalizedKind.includes("identity") ||
    normalizedKind.includes("scene") ||
    normalizedKind.includes("prop") ||
    normalizedKind.includes("director") ||
    normalizedKind.includes("control")
  ) {
    return "image";
  }
  return "unknown";
}

function addUnique(
  out: LibraryAsset[],
  seen: Set<string>,
  asset: LibraryAsset,
): void {
  const key = libraryAssetDedupKey(asset);
  if (seen.has(key)) return;
  seen.add(key);
  out.push(asset);
}

function libraryAssetDedupKey(asset: LibraryAsset): string {
  const base = asset.url || asset.id;
  if (!isBeatScopedLibraryAsset(asset)) return base;
  const beatContext = asset.beatContext;
  const sourceProjectId =
    typeof asset.source.projectId === "string" ? asset.source.projectId : beatContext?.projectId;
  const sourceEpisode =
    typeof asset.source.episode === "number" ? asset.source.episode : beatContext?.episode;
  const sourceBeat =
    typeof asset.source.beat === "number" ? asset.source.beat : beatContext?.beat;
  if (!sourceProjectId || typeof sourceEpisode !== "number" || typeof sourceBeat !== "number") {
    return base;
  }
  return `${base}:beat:${sourceProjectId}:${sourceEpisode}:${sourceBeat}:${asset.role || asset.kind}`;
}

function tabForRef(ref: PresetReference): AssetTab {
  const kind = ref.kind || "";
  const role = ref.role || "";
  if (
    kind === "identity" ||
    kind === "identity_costume" ||
    kind === "identity_portrait" ||
    role.startsWith("character_")
  ) {
    return "characters";
  }
  if (kind === "scene") return "scenes";
  if (kind === "prop") return "props";
  if (isBeatOutputRole(role)) return "beat";
  if (kind === "director") return isSceneAssetRole(role) ? "scenes" : "beat";
  return "beat";
}

function aspectForRef(ref: PresetReference): string {
  const role = ref.role || "";
  if (
    role.includes("combined") ||
    role.includes("env") ||
    role.includes("sketch") ||
    role.includes("render") ||
    role.includes("frame")
  ) {
    return "16:9";
  }
  return "1:1";
}

function isBeatScopedLibraryAsset(asset: LibraryAsset): boolean {
  const role =
    typeof asset.role === "string" && asset.role
      ? asset.role
      : typeof asset.source.role === "string"
        ? asset.source.role
        : "";
  const kind =
    typeof asset.kind === "string" && asset.kind
      ? asset.kind
      : typeof asset.source.kind === "string"
        ? asset.source.kind
        : "";
  return (
    BEAT_SCOPED_LIBRARY_ASSET_ROLES.has(role) ||
    BEAT_SCOPED_LIBRARY_ASSET_KINDS.has(kind)
  );
}
