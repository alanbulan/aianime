// Copyright (c) 2026 AI anime
import {
  directorPanoSourceFromCanvasNode,
  isPanoImageCanvasNode,
} from "../domain/directorWorldSources";
import { hasMainlineContexts, type MainlineContext } from "../domain/mainlineContext";
import { resolveNodeDisplayName } from "../domain/nodeDisplay";
import {
  pickCanvasImageTo3dResultUrl,
  type CanvasImageTo3dVisibleSourceKind,
} from "../domain/imageTo3d";
import type { DirectorStageManifest, DirectorWorldSource, ThreeDSceneSnapshot } from '@/features/viewer-kit/public';

type ThreeDWorldNodeData = {
  [key: string]: any;
};

type CanvasNode = {
  id: string;
  type?: string | null;
  position: { x: number; y: number };
  data: Record<string, any>;
  measured?: { width?: number; height?: number };
  width?: number | null;
  height?: number | null;
  [key: string]: any;
};

export const THREE_D_WORLD_NODE_SIZE_LIMITS = {
  defaultWidth: 340,
  defaultHeight: 210,
  minWidth: 280,
  minHeight: 170,
  maxWidth: 1200,
  maxHeight: 900,
} as const;

const SCENE_DIRECTOR_SOURCE_ROLES = new Set([
  'scene_director_world',
  'scene_director_pano_360',
  'scene_3gs_master_ply',
  'scene_3gs_reverse_ply',
  'scene_3gs_pano_ply',
  'scene_3gs_custom_scene',
]);

type LocalDirectorManifestSource = DirectorStageManifest['source'];

export interface ThreeDWorldUpstreamRef {
  nodeId: string;
  kind: 'image' | 'text';
  displayName: string;
  imageUrl?: string | null;
  textContent?: string | null;
}

export interface ThreeDWorldReferenceImage {
  nodeId: string;
  url: string;
  displayName: string;
}

export interface ThreeDWorldReferenceText {
  nodeId: string;
  text: string;
  displayName: string;
}

export interface ThreeDWorldReferenceProjection {
  selectedImageRef: (ThreeDWorldUpstreamRef & { imageUrl: string }) | null;
  activeRef: ThreeDWorldUpstreamRef | null;
  referenceImages: ThreeDWorldReferenceImage[];
}

export interface ThreeDWorldBeatContext {
  episode: number;
  beat: number;
}

export interface ThreeDWorldPreviewProjection {
  hasMainlineContext: boolean;
  previewUrl: string | null;
  hasPreview: boolean;
}

function nodeLabel(node: CanvasNode): string {
  const displayName = (node.data as { displayName?: unknown }).displayName;
  if (typeof displayName === 'string' && displayName.trim()) {
    return displayName;
  }
  return node.type ?? '上游节点';
}

function projectUpstreamRef(
  node: CanvasNode | undefined | null,
): ThreeDWorldUpstreamRef | null {
  if (!node) return null;
  if (node.type === "imageGenNode") {
    const referenceUrl =
      typeof node.data.referenceImageUrl === 'string' &&
      node.data.referenceImageUrl.length > 0
        ? node.data.referenceImageUrl
        : null;
    const imageUrl = node.data.imageUrl || referenceUrl;
    if (!imageUrl) return null;
    return {
      nodeId: node.id,
      kind: 'image',
      displayName: nodeLabel(node),
      imageUrl,
    };
  }
  if (
    node.type === "uploadNode" ||
    node.type === "imageNode" ||
    node.type === "exportImageNode" ||
    node.type === "storyboardGenNode"
  ) {
    if (!node.data.imageUrl) return null;
    return {
      nodeId: node.id,
      kind: 'image',
      displayName: nodeLabel(node),
      imageUrl: node.data.imageUrl,
    };
  }
  if (node.type === "textAnnotationNode") {
    const text = (node.data.content ?? '').trim();
    if (!text) return null;
    return {
      nodeId: node.id,
      kind: 'text',
      displayName: nodeLabel(node),
      textContent: text,
    };
  }
  return null;
}

export function projectThreeDWorldReferences(
  nodes: CanvasNode[],
  selectedSourceNodeId: string | null | undefined,
): ThreeDWorldReferenceProjection {
  const sortedNodes = [...nodes].sort(
    (a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0),
  );
  const refs = sortedNodes
    .map(projectUpstreamRef)
    .filter((ref): ref is ThreeDWorldUpstreamRef => ref !== null);
  const imageRefs = refs.filter(
    (
      ref,
    ): ref is ThreeDWorldUpstreamRef & { imageUrl: string } =>
      ref.kind === 'image' && typeof ref.imageUrl === 'string',
  );
  const selectedImageRef =
    imageRefs.find((ref) => ref.nodeId === selectedSourceNodeId) ??
    imageRefs[0] ??
    null;
  const textRef =
    refs.find(
      (
        ref,
      ): ref is ThreeDWorldUpstreamRef & { textContent: string } =>
        ref.kind === 'text' && typeof ref.textContent === 'string',
    ) ?? null;
  return {
    selectedImageRef,
    activeRef: selectedImageRef ?? textRef,
    referenceImages: imageRefs.map((ref) => ({
      nodeId: ref.nodeId,
      url: ref.imageUrl,
      displayName: ref.displayName,
    })),
  };
}

export function projectThreeDWorldPanoSources(
  nodes: CanvasNode[],
): DirectorWorldSource[] {
  const sources: DirectorWorldSource[] = [];
  for (const node of nodes) {
    const source = directorPanoSourceFromCanvasNode(node);
    if (source) sources.push(source);
  }
  return sources;
}

export function pickThreeDWorldPlyUrl(result: unknown): string | null {
  return pickCanvasImageTo3dResultUrl(result);
}

function resolveNodeDimension(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 1) {
    return Math.round(value);
  }
  return fallback;
}

export function resolveThreeDWorldNodeSize(
  width: number | undefined,
  height: number | undefined,
): { width: number; height: number } {
  return {
    width: resolveNodeDimension(
      width,
      THREE_D_WORLD_NODE_SIZE_LIMITS.defaultWidth,
    ),
    height: resolveNodeDimension(
      height,
      THREE_D_WORLD_NODE_SIZE_LIMITS.defaultHeight,
    ),
  };
}

export function resolveThreeDWorldTitle(data: ThreeDWorldNodeData): string {
  return resolveNodeDisplayName("threeDWorldNode", data);
}

function sourceKindForManifest(
  value: LocalDirectorManifestSource['source_kind'] | 'active' | undefined,
): LocalDirectorManifestSource['source_kind'] {
  return value && value !== 'active' ? value : 'custom';
}

function sourceFromDirectorWorldSource(
  source: NonNullable<ThreeDWorldNodeData['sources']>[number] | undefined,
): LocalDirectorManifestSource | null {
  if (!source || source.source_type === 'mesh') return null;
  return {
    source_type: source.source_type,
    ply_url: source.ply_url,
    url: source.url ?? source.ply_url ?? source.pano_url,
    pano_url: source.pano_url,
    pano_fs: source.pano_fs,
    collision_glb_url: source.collision_glb_url,
    source_kind: sourceKindForManifest(source.source_kind),
    transform: source.transform,
  };
}

function sourceFromLegacyData(
  data: ThreeDWorldNodeData,
): LocalDirectorManifestSource | null {
  if (!data.plyUrl && !data.panoUrl) return null;
  const sourceType = data.plyUrl ? 'sog' : 'pano360';
  const sourceKind =
    data.plyKind === 'master' ||
    data.plyKind === 'reverse' ||
    data.plyKind === 'pano'
      ? data.plyKind
      : 'custom';
  return {
    source_type: sourceType,
    ply_url: data.plyUrl ?? undefined,
    url: data.plyUrl ?? data.panoUrl ?? undefined,
    pano_url: data.panoUrl ?? undefined,
    source_kind: sourceKind,
  };
}

function directorSourceFromLegacyData(
  data: ThreeDWorldNodeData,
): DirectorWorldSource | null {
  const source = sourceFromLegacyData(data);
  if (!source) return null;
  const sourceType = data.plyUrl ? 'sog' : 'pano360';
  return {
    id: `node:${sourceType}:${source.url ?? source.ply_url ?? source.pano_url ?? 'source'}`,
    source_type: sourceType,
    source_kind: source.source_kind,
    label: sourceType === 'pano360' ? 'Pano 360' : source.source_kind,
    ply_url: source.ply_url,
    url: source.url,
    pano_url: source.pano_url,
    collision_glb_url: source.collision_glb_url,
    current: true,
  };
}

function sameDirectorSourceUrl(
  a: DirectorWorldSource,
  b: DirectorWorldSource,
): boolean {
  const aUrl = a.pano_url ?? a.ply_url ?? a.url;
  const bUrl = b.pano_url ?? b.ply_url ?? b.url;
  return Boolean(aUrl && bUrl && aUrl === bUrl);
}

function sourceRoleFromNode(data: ThreeDWorldNodeData): string | null {
  const source = (data as { __freezone_source?: unknown }).__freezone_source;
  if (!source || typeof source !== 'object') return null;
  const sourceRecord = source as Record<string, unknown>;
  if (typeof sourceRecord.role === 'string') return sourceRecord.role;
  const meta = sourceRecord.meta;
  const metaRole =
    meta && typeof meta === 'object'
      ? (meta as Record<string, unknown>).role
      : null;
  return typeof metaRole === 'string' ? metaRole : null;
}

function isImportedSceneDirectorWorldBundle(
  data: ThreeDWorldNodeData,
): boolean {
  if ((data as { user_spawned?: unknown }).user_spawned !== true) return false;
  return sourceRoleFromNode(data) === 'scene_director_world';
}

export function isCandidateDirectorWorldNode(
  data: ThreeDWorldNodeData,
): boolean {
  if ((data as { user_spawned?: unknown }).user_spawned === true) return true;
  return !hasMainlineContexts(
    (data as { mainline_context?: unknown }).mainline_context,
  );
}

export function directorSourcesForNode(
  data: ThreeDWorldNodeData,
  upstreamPanoSources: DirectorWorldSource[],
): DirectorWorldSource[] {
  const explicitSources = ((data.sources ?? []) as DirectorWorldSource[]).filter(
    (source) => source.source_type !== 'mesh',
  );
  const hasMainlineContext = hasMainlineContexts(
    (data as { mainline_context?: unknown }).mainline_context,
  );
  if (
    !hasMainlineContext ||
    ((data as { user_spawned?: unknown }).user_spawned === true &&
      !isImportedSceneDirectorWorldBundle(data))
  ) {
    const activeSource =
      explicitSources.find(
        (source) => source.id && source.id === data.activeSourceId,
      ) ??
      explicitSources.find((source) => source.current) ??
      explicitSources[0] ??
      directorSourceFromLegacyData(data);
    return activeSource ? [activeSource] : [];
  }
  const sources = explicitSources.length > 0 ? [...explicitSources] : [];
  const legacySource = directorSourceFromLegacyData(data);
  if (legacySource && sources.length === 0) sources.push(legacySource);
  for (const source of upstreamPanoSources) {
    if (!sources.some((item) => sameDirectorSourceUrl(item, source))) {
      sources.push(source);
    }
  }
  return sources;
}

export function buildLocalThreeDWorldDirectorManifest({
  project,
  data,
  contexts,
  beatContext,
  upstreamPanoSources,
  defaultPalette,
}: {
  project: string;
  data: ThreeDWorldNodeData;
  contexts: MainlineContext[];
  beatContext: ThreeDWorldBeatContext | null;
  upstreamPanoSources: DirectorWorldSource[];
  defaultPalette: DirectorStageManifest['palette'] | null;
}): DirectorStageManifest {
  const directorSources = directorSourcesForNode(data, upstreamPanoSources);
  const activeSource =
    directorSources.find(
      (source) => source.id && source.id === data.activeSourceId,
    ) ??
    directorSources.find((source) => source.current) ??
    directorSources[0];
  const manifestSource =
    sourceFromDirectorWorldSource(activeSource) ??
    sourceFromLegacyData(data) ?? {
      source_type: 'sog' as const,
      source_kind: 'custom' as const,
      url: undefined,
      ply_url: undefined,
      pano_url: undefined,
    };
  const sceneContext = contexts.find(
    (context) =>
      context.kind === 'scene' && typeof context.sceneId === 'string',
  );
  const sceneId =
    sceneContext &&
    typeof sceneContext.sceneId === 'string' &&
    sceneContext.sceneId.trim()
      ? sceneContext.sceneId
      : 'freezone-3gs';
  return {
    viewer_kind: 'three_d_director',
    mode: beatContext ? 'beat' : 'scene',
    project,
    scene_id: sceneId,
    display_name:
      typeof data.displayName === 'string' && data.displayName.trim()
        ? data.displayName
        : '导演世界',
    source: manifestSource,
    sources: directorSources.length > 0 ? directorSources : undefined,
    active_source_id: data.activeSourceId ?? activeSource?.id,
    beat_context: beatContext
      ? {
          episode: beatContext.episode,
          beat: beatContext.beat,
          detected_identities: [],
          detected_props: [],
        }
      : undefined,
    palette: {
      actors: [],
      props: [],
      anonymous_colors: beatContext
        ? []
        : (defaultPalette?.anonymous_colors ?? []),
      anonymous_prop_colors:
        defaultPalette?.anonymous_prop_colors ?? [],
    },
    allowed_destinations: beatContext
      ? [
          'view',
          'download',
          'beat_selected_background',
          'canvas_screenshot_node',
        ]
      : ['view', 'download', 'canvas_screenshot_node'],
  };
}

export function usableDirectorWorldPreviewUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = value.trim();
  const clean = url.split('?')[0].toLowerCase();
  if (
    clean.endsWith('.sog') ||
    clean.endsWith('.ply') ||
    clean.endsWith('.glb') ||
    clean.endsWith('.json')
  ) {
    return null;
  }
  return url;
}

export function isSceneDirectorWorldNode(
  data: ThreeDWorldNodeData,
): boolean {
  if ((data as { user_spawned?: unknown }).user_spawned === true) return false;
  if (
    !hasMainlineContexts(
      (data as { mainline_context?: unknown }).mainline_context,
    )
  ) {
    return false;
  }
  const sourceRole = sourceRoleFromNode(data);
  return Boolean(sourceRole && SCENE_DIRECTOR_SOURCE_ROLES.has(sourceRole));
}

export function resolveThreeDWorldBeatContext(
  data: ThreeDWorldNodeData,
  contexts: MainlineContext[],
): ThreeDWorldBeatContext | null {
  if (isSceneDirectorWorldNode(data)) return null;
  for (const context of contexts) {
    if (
      typeof context.episode === 'number' &&
      typeof context.beat === 'number'
    ) {
      return { episode: context.episode, beat: context.beat };
    }
  }
  return null;
}

export function resolveThreeDWorldImageSourceKind(
  sourceNode: CanvasNode | null,
  persistedKind: ThreeDWorldNodeData['plyKind'],
): CanvasImageTo3dVisibleSourceKind {
  if (persistedKind === 'pano' || persistedKind === 'master') {
    return persistedKind;
  }
  return sourceNode && isPanoImageCanvasNode(sourceNode) ? 'pano' : 'master';
}

export function projectThreeDWorldPreview({
  data,
  activeRef,
  upstreamPanoSources,
}: {
  data: ThreeDWorldNodeData;
  activeRef: ThreeDWorldUpstreamRef | null;
  upstreamPanoSources: DirectorWorldSource[];
}): ThreeDWorldPreviewProjection {
  const hasWorldSource = Boolean(
    data.plyUrl ||
      data.panoUrl ||
      data.sources?.length ||
      upstreamPanoSources.length,
  );
  const hasMainlineContext = !isCandidateDirectorWorldNode(data);
  const upstreamUrl =
    hasWorldSource && activeRef?.kind === 'image' && activeRef.imageUrl
      ? activeRef.imageUrl
      : null;
  const fallbackUrl = usableDirectorWorldPreviewUrl(data.previewImageUrl);
  const slotTarget = data.slot_target as
    | { kind?: unknown }
    | null
    | undefined;
  const isDirectorRenderNode =
    Boolean(
      (data as { director_control_bundle?: unknown }).director_control_bundle,
    ) || slotTarget?.kind === 'director_render';
  const previewUrl = isDirectorRenderNode
    ? fallbackUrl ?? upstreamUrl
    : upstreamUrl ?? fallbackUrl;
  return {
    hasMainlineContext,
    previewUrl,
    hasPreview: Boolean(previewUrl),
  };
}

export function buildThreeDWorldSaveScenePatch(
  data: ThreeDWorldNodeData,
  upstreamPanoSources: DirectorWorldSource[],
  snapshot: ThreeDSceneSnapshot,
  activeSourceId?: string,
): Partial<ThreeDWorldNodeData> {
  const snapshotSourceId =
    typeof snapshot.world?.activeSourceId === 'string'
      ? snapshot.world.activeSourceId
      : undefined;
  const nextActiveSourceId = activeSourceId || snapshotSourceId;
  const sourceTransform = snapshot.world?.sourceTransform;
  const nextDirectorSources = directorSourcesForNode(
    data,
    upstreamPanoSources,
  );
  const nextSources =
    nextActiveSourceId && sourceTransform
      ? nextDirectorSources.map((source) =>
          source.id === nextActiveSourceId
            ? { ...source, transform: sourceTransform }
            : source,
        )
      : null;
  return {
    scene: snapshot,
    ...(nextActiveSourceId
      ? {
          scenesBySourceId: {
            ...(data.scenesBySourceId ?? {}),
            [nextActiveSourceId]: snapshot,
          },
          activeSourceId: nextActiveSourceId,
        }
      : {}),
    ...(nextSources ? { sources: nextSources } : {}),
  };
}

export function buildThreeDWorldClearScenePatch(
  data: ThreeDWorldNodeData,
  activeSourceId?: string,
): Partial<ThreeDWorldNodeData> {
  if (!activeSourceId) return { scene: null, scenesBySourceId: {} };
  const scenesBySourceId = { ...(data.scenesBySourceId ?? {}) };
  delete scenesBySourceId[activeSourceId];
  const currentScene =
    data.scene && typeof data.scene === 'object'
      ? (data.scene as { world?: { activeSourceId?: unknown } })
      : null;
  const currentSceneSourceId =
    typeof currentScene?.world?.activeSourceId === 'string'
      ? currentScene.world.activeSourceId
      : undefined;
  return {
    scene:
      currentSceneSourceId === activeSourceId ? null : (data.scene ?? null),
    scenesBySourceId,
  };
}
