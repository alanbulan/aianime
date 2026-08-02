// Copyright (c) 2026 AI anime
import {
  directorSourceIdentityUrl,
  type DirectorWorldSourceDescriptor,
  type DirectorWorldSourceKind,
  type DirectorWorldSourceType,
} from "@/modules/asset_world/public";

import type { PushResult, PushTarget } from "./assetCommit";

export type SceneDirectorWorldTarget = Extract<
  PushTarget,
  { kind: "scene_director_world" }
>;

export type DirectorWorldSourceSlotTarget = Extract<PushTarget, {
  kind:
    | "scene_director_pano_360"
    | "scene_3gs_master_ply"
    | "scene_3gs_reverse_ply"
    | "scene_3gs_pano_ply"
    | "scene_3gs_custom_scene";
}>;

type DirectorWorldSource = Partial<DirectorWorldSourceDescriptor> &
  Record<string, unknown> & {
    transform?: unknown;
  };

export interface DirectorWorldSceneSnapshot extends Record<string, unknown> {
  world?: Record<string, unknown> & { activeSourceId?: string };
}

export interface SceneDirectorWorldCommitPlanEntry {
  sourceId: string;
  snapshot: DirectorWorldSceneSnapshot;
  source?: Record<string, unknown>;
}

export interface SceneDirectorWorldCommitPlan {
  sceneId: string;
  entries: SceneDirectorWorldCommitPlanEntry[];
  result: PushResult;
}

const SOURCE_KIND_BY_SLOT: Record<
  DirectorWorldSourceSlotTarget["kind"],
  DirectorWorldSourceKind
> = {
  scene_director_pano_360: "pano",
  scene_3gs_master_ply: "master",
  scene_3gs_reverse_ply: "reverse",
  scene_3gs_pano_ply: "pano",
  scene_3gs_custom_scene: "custom",
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasMainlineContext(nodeData: Record<string, unknown>): boolean {
  return Array.isArray(nodeData.mainline_context) && nodeData.mainline_context.some((context) =>
    Boolean(recordValue(context)),
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function sceneSnapshot(value: unknown): DirectorWorldSceneSnapshot | null {
  return recordValue(value) as DirectorWorldSceneSnapshot | null;
}

function directorWorldSources(value: unknown): DirectorWorldSource[] {
  return Array.isArray(value)
    ? value.filter((source): source is DirectorWorldSource =>
        Boolean(source && typeof source === "object"),
      )
    : [];
}

export function hasDirectorWorldSceneState(
  nodeData: Record<string, unknown> | null | undefined,
): boolean {
  if (!nodeData) return false;
  if (sceneSnapshot(nodeData.scene)) return true;
  const scenesBySourceId = recordValue(nodeData.scenesBySourceId);
  return Object.values(scenesBySourceId ?? {}).some((snapshot) =>
    Boolean(sceneSnapshot(snapshot)),
  );
}

function sourceUrl(source: DirectorWorldSource | undefined): string {
  return stringValue(source?.url) ||
    stringValue(source?.ply_url) ||
    stringValue(source?.pano_url);
}

function isCanonicalDirectorWorldUrl(url: string): boolean {
  return url.includes("/director_worlds/") && !url.includes("/freezone/");
}

function isUncommittedDirectorWorldSource(
  source: DirectorWorldSource | undefined,
): boolean {
  if (!source) return false;
  const url = sourceUrl(source);
  return !url || !isCanonicalDirectorWorldUrl(url);
}

function sourceIdFromSnapshot(
  snapshot: DirectorWorldSceneSnapshot | null,
): string {
  return stringValue(snapshot?.world?.activeSourceId);
}

function sourceIdForCommittedSlot(
  target: DirectorWorldSourceSlotTarget,
  targetUrl: string,
): string {
  if (target.kind === "scene_director_pano_360") {
    return `scene-pano:${target.scene_id}`;
  }
  return `legacy:${SOURCE_KIND_BY_SLOT[target.kind]}:sog:${directorSourceIdentityUrl(targetUrl)}`;
}

function canonicalSceneSourceId(sourceId: string): string {
  const trimmed = sourceId.trim();
  if (!trimmed.startsWith("legacy:")) return trimmed;
  const parts = trimmed.split(":");
  if (parts.length < 4) return trimmed;
  const [prefix, sourceKind, sourceType, ...urlParts] = parts;
  const identityUrl = directorSourceIdentityUrl(urlParts.join(":"));
  return `${prefix}:${sourceKind}:${sourceType}:${identityUrl}`;
}

function sourcePatchForCommittedSlot(
  target: DirectorWorldSourceSlotTarget,
  targetUrl: string,
  sourceId: string,
): DirectorWorldSource {
  const sourceType: DirectorWorldSourceType =
    target.kind === "scene_director_pano_360" ? "pano360" : "sog";
  return {
    id: sourceId,
    source_type: sourceType,
    source_kind: SOURCE_KIND_BY_SLOT[target.kind],
    label: sourceLabelForSlot(target.kind),
    url: targetUrl,
    ...(sourceType === "pano360"
      ? { pano_url: targetUrl, slot_kind: "scene_director_pano_360" as const }
      : { ply_url: targetUrl }),
    current: true,
  };
}

function sourceLabelForSlot(
  kind: DirectorWorldSourceSlotTarget["kind"],
): string {
  if (kind === "scene_3gs_master_ply") return "正面世界";
  if (kind === "scene_3gs_reverse_ply") return "背面世界";
  if (kind === "scene_3gs_pano_ply") return "360世界";
  if (kind === "scene_3gs_custom_scene") return "自定义世界";
  return "360图";
}

function sourceFilename(
  result: Pick<PushResult, "target_path" | "target_url">,
): string {
  const raw = stringValue(result.target_path) || stringValue(result.target_url);
  const clean = raw.split("#", 1)[0]?.split("?", 1)[0] ?? raw;
  return clean.split("/").filter(Boolean).pop() || raw;
}

function projectIdFromNodeData(
  nodeData: Record<string, unknown>,
  projectId?: string,
): string {
  const explicit = stringValue(projectId);
  if (explicit) return explicit;
  const contexts = Array.isArray(nodeData.mainline_context)
    ? nodeData.mainline_context
    : [];
  for (const context of contexts) {
    const project = recordValue(context);
    const value = stringValue(project?.projectId);
    if (value) return value;
  }
  const source = recordValue(nodeData.__freezone_source);
  const meta = recordValue(source?.meta);
  return (
    stringValue(source?.projectId) ||
    stringValue(meta?.projectId) ||
    stringValue(meta?.project_id)
  );
}

function snapshotForSourceId(
  snapshot: DirectorWorldSceneSnapshot,
  sourceId: string,
): DirectorWorldSceneSnapshot {
  return {
    ...snapshot,
    world: {
      ...snapshot.world,
      activeSourceId: sourceId,
    },
  };
}

function committedSourceSlotFromNodeData(
  nodeData: Record<string, unknown>,
): {
  target: DirectorWorldSourceSlotTarget;
  targetUrl: string;
  sourceId: string;
} | null {
  const target = recordValue(nodeData.slot_target);
  const pushTarget = target as unknown as PushTarget | null;
  if (!pushTarget || !isDirectorWorldSourceSlotTarget(pushTarget)) return null;
  const targetUrl = stringValue(nodeData.committed_slot_url);
  if (!targetUrl) return null;
  const sourceId = sourceIdForCommittedSlot(pushTarget, targetUrl);
  return { target: pushTarget, targetUrl, sourceId };
}

function mainlineSourceIdForLocalSource(
  nodeData: Record<string, unknown>,
  localSourceId: string,
): string {
  const committedSlot = committedSourceSlotFromNodeData(nodeData);
  const activeSourceId = stringValue(nodeData.activeSourceId);
  if (committedSlot && activeSourceId && localSourceId === activeSourceId) {
    return committedSlot.sourceId;
  }
  return canonicalSceneSourceId(localSourceId);
}

function sourcePayloadForMainlineCommit(
  nodeData: Record<string, unknown>,
  sources: DirectorWorldSource[],
  localSourceId: string,
): Record<string, unknown> | undefined {
  const source = sources.find((item) => item.id === localSourceId);
  const committedSlot = committedSourceSlotFromNodeData(nodeData);
  const activeSourceId = stringValue(nodeData.activeSourceId);
  if (committedSlot && activeSourceId && localSourceId === activeSourceId) {
    return {
      ...source,
      ...sourcePatchForCommittedSlot(
        committedSlot.target,
        committedSlot.targetUrl,
        committedSlot.sourceId,
      ),
      ...(source?.transform ? { transform: source.transform } : {}),
    };
  }
  if (!source) return undefined;
  const sourceId = stringValue(source.id);
  return {
    ...source,
    ...(sourceId ? { id: canonicalSceneSourceId(sourceId) } : {}),
  };
}

export function isDirectorWorldSourceSlotTarget(
  target: PushTarget,
): target is DirectorWorldSourceSlotTarget {
  return (
    target.kind === "scene_director_pano_360" ||
    target.kind === "scene_3gs_master_ply" ||
    target.kind === "scene_3gs_reverse_ply" ||
    target.kind === "scene_3gs_pano_ply" ||
    target.kind === "scene_3gs_custom_scene"
  );
}

export function nodeDataAfterDirectorWorldSourceSlotCommit(
  nodeData: Record<string, unknown>,
  target: DirectorWorldSourceSlotTarget,
  result: Pick<PushResult, "target_path" | "target_url">,
  projectId?: string,
): Record<string, unknown> {
  const targetUrl = stringValue(result.target_url);
  if (!targetUrl) return nodeData;
  const isCandidate = nodeData.user_spawned === true ||
    !hasMainlineContext(nodeData);
  const sources = directorWorldSources(nodeData.sources);
  const currentScene = sceneSnapshot(nodeData.scene);
  const previousActiveSourceId =
    stringValue(nodeData.activeSourceId) ||
    sourceIdFromSnapshot(currentScene) ||
    stringValue(sources.find((source) => source.current)?.id) ||
    stringValue(sources[0]?.id) ||
    "committed-source";
  const committedSourceId = sourceIdForCommittedSlot(target, targetUrl);
  const activeSourceId = isCandidate ? previousActiveSourceId : committedSourceId;
  const sourceType: DirectorWorldSourceType =
    target.kind === "scene_director_pano_360" ? "pano360" : "sog";
  const candidateSourcePatch: Partial<DirectorWorldSource> = {
    url: targetUrl,
    ...(sourceType === "pano360"
      ? { pano_url: targetUrl, slot_kind: "scene_director_pano_360" as const }
      : { ply_url: targetUrl }),
    current: true,
  };
  const sourcePatch = isCandidate
    ? {
        id: activeSourceId,
        source_type: sources.find((source) => source.id === activeSourceId)?.source_type ?? sourceType,
        source_kind: sources.find((source) => source.id === activeSourceId)?.source_kind ?? "custom",
        ...candidateSourcePatch,
      } satisfies DirectorWorldSource
    : sourcePatchForCommittedSlot(target, targetUrl, activeSourceId);
  const nextSources = isCandidate
    ? [sourcePatch]
    : sources.length > 0
      ? sources.map((source) =>
          source.id === activeSourceId
            ? { ...source, ...sourcePatch }
            : { ...source, current: false },
        )
      : [sourcePatch];
  if (!nextSources.some((source) => source.id === activeSourceId)) {
    nextSources.push(sourcePatch);
  }
  const previousScenes = recordValue(nodeData.scenesBySourceId) ?? {};
  const previousSnapshot =
    sceneSnapshot(previousScenes[previousActiveSourceId]) ?? currentScene;
  const nextSnapshot = previousSnapshot
    ? snapshotForSourceId(previousSnapshot, activeSourceId)
    : null;
  const nextScenesBySourceId: Record<string, unknown> = isCandidate
    ? {}
    : { ...previousScenes };
  if (!isCandidate && previousActiveSourceId !== activeSourceId) {
    delete nextScenesBySourceId[previousActiveSourceId];
  }
  if (nextSnapshot) {
    nextScenesBySourceId[activeSourceId] = nextSnapshot;
  }
  const sourceLabel = sourceLabelForSlot(target.kind);
  const displayName = `${target.scene_id} / ${sourceLabel}`;
  const effectiveProjectId = projectIdFromNodeData(nodeData, projectId);
  const mainlineContext = effectiveProjectId
    ? [{
        kind: "scene",
        projectId: effectiveProjectId,
        sceneId: target.scene_id,
        role: target.kind,
        label: displayName,
        sourceUrl: targetUrl,
      }]
    : nodeData.mainline_context;
  const previousSource = recordValue(nodeData.__freezone_source);
  const previousMeta = recordValue(previousSource?.meta);
  const nextSourceMeta = {
    ...previousMeta,
    scene_id: target.scene_id,
    scene: target.scene_id,
    source_kind: SOURCE_KIND_BY_SLOT[target.kind],
    source_type: sourceType,
  };

  return {
    ...nodeData,
    activeSourceId,
    displayName: isCandidate ? `已提交 · ${displayName}` : displayName,
    sourceFileName: sourceFilename(result),
    slot_target: target,
    committed_slot_url: targetUrl,
    committed_source_id: committedSourceId,
    committed_target_label: displayName,
    ...(isCandidate
      ? {
          mainline_context: undefined,
          __freezone_source: previousSource ?? nodeData.__freezone_source,
        }
      : {
          __freezone_source: {
            ...previousSource,
            kind: "scene",
            role: target.kind,
            label: displayName,
            meta: nextSourceMeta,
            media_type: "file",
            url: targetUrl,
            slot_target: target,
            pushable: true,
          },
          mainline_context: mainlineContext,
        }),
    sources: nextSources,
    ...(nextSnapshot ? { scene: nextSnapshot } : {}),
    scenesBySourceId: nextScenesBySourceId,
    ...(sourceType === "pano360"
      ? {
          panoUrl: targetUrl,
          url: targetUrl,
          plyUrl: undefined,
          modelUrl: undefined,
          fileUrl: undefined,
        }
      : {
          plyUrl: targetUrl,
          modelUrl: targetUrl,
          fileUrl: targetUrl,
          url: targetUrl,
          panoUrl: undefined,
        }),
  };
}

export function buildSceneDirectorWorldCommitPlan(
  target: SceneDirectorWorldTarget,
  nodeData: Record<string, unknown>,
): SceneDirectorWorldCommitPlan {
  const sources = directorWorldSources(nodeData.sources);
  const activeSourceId =
    stringValue(nodeData.activeSourceId) ||
    sourceIdFromSnapshot(sceneSnapshot(nodeData.scene)) ||
    stringValue(sources.find((source) => source.current)?.id) ||
    stringValue(sources[0]?.id);

  const scenesBySourceId = recordValue(nodeData.scenesBySourceId) ?? {};
  const snapshots = new Map<string, DirectorWorldSceneSnapshot>();
  for (const [sourceId, snapshot] of Object.entries(scenesBySourceId)) {
    const trimmed = sourceId.trim();
    const scene = sceneSnapshot(snapshot);
    if (trimmed && scene) {
      snapshots.set(trimmed, scene);
    }
  }

  const currentScene = sceneSnapshot(nodeData.scene);
  if (currentScene) {
    const currentSourceId = activeSourceId || sourceIdFromSnapshot(currentScene);
    if (currentSourceId) {
      snapshots.set(currentSourceId, currentScene);
    }
  }

  if (snapshots.size === 0) {
    throw new Error("当前导演世界没有可提交的场景状态");
  }

  for (const sourceId of snapshots.keys()) {
    const source = sources.find((item) => item.id === sourceId);
    if (isUncommittedDirectorWorldSource(source)) {
      throw new Error("先把当前世界来源提交到主线槽位，再提交导演世界状态");
    }
  }

  const orderedSnapshots = Array.from(snapshots.entries());
  orderedSnapshots.sort(([a], [b]) => {
    if (a === activeSourceId) return 1;
    if (b === activeSourceId) return -1;
    return 0;
  });

  const entries = orderedSnapshots.map(([localSourceId, snapshot]) => {
    const sourceId = mainlineSourceIdForLocalSource(nodeData, localSourceId);
    return {
      sourceId,
      snapshot: sourceId === localSourceId
        ? snapshot
        : snapshotForSourceId(snapshot, sourceId),
      source: sourcePayloadForMainlineCommit(
        nodeData,
        sources,
        localSourceId,
      ),
    };
  });
  const finalSourceId = orderedSnapshots[orderedSnapshots.length - 1]?.[0] ??
    activeSourceId;
  const finalSource = sources.find((source) => source.id === finalSourceId);

  return {
    sceneId: target.scene_id,
    entries,
    result: {
      target_path: `director_worlds/${target.scene_id}/v1/stage_manifest.json`,
      target_url: sourceUrl(finalSource),
      backup: null,
      affected_count: orderedSnapshots.length,
    },
  };
}
