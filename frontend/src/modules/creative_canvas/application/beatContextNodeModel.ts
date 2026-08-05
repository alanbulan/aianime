// Copyright (c) 2026 AI anime
import type { BeatUpdate } from '@/modules/narrative_planning/public';
import { extractMainlineContextsFromNode } from '../domain/mainlineContext';
import {
  isPresetManagedEdge,
  isPresetManagedNode,
} from '../domain/mainlineNodeFlags';
import { parseBeatContextVisualMarkers } from '../domain/currentBeatContext';
import { sceneNameToRef } from '@/lib/scene-ref';

export interface BeatContextGraphNode {
  id: string;
  type?: string | null;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  measured?: { width?: number; height?: number };
  width?: number | null;
  height?: number | null;
  parentId?: string | null;
  extent?: unknown;
  [key: string]: unknown;
}

export interface BeatContextGraphEdge {
  id: string;
  source: string;
  target: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface BeatContextNodeModelData {
  prompt?: unknown;
  content?: unknown;
  displayName?: unknown;
  episode?: unknown;
  beat?: unknown;
  workbench_target?: unknown;
  context_scope?: unknown;
  beat_context?: unknown;
  snapshot?: BeatContextNodeSnapshot | null;
  beat_edit_fields?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface BeatContextNodeSnapshot {
  visualDescription?: string;
  narrationSegment?: string;
  sceneId?: string;
  sceneVariantId?: string;
  timeOfDay?: string;
  detectedIdentities?: string[];
  detectedProps?: string[];
  sketchColors?: Record<string, string>;
  propMarkerColors?: Record<string, string>;
  [key: string]: unknown;
}

export type BeatContextNodePatch = Record<string, unknown> & {
  beat_context?: unknown;
  content?: string;
  snapshot?: BeatContextNodeSnapshot | null;
  syncStatus?: 'fresh' | 'stale' | 'syncing' | 'error';
  errorMessage?: string;
  beat_edit_fields?: Record<string, unknown>;
};

export const BEAT_CONTEXT_NODE_SIZE_LIMITS = {
  defaultWidth: 420,
  defaultHeight: 560,
  minWidth: 360,
  minHeight: 360,
  maxWidth: 760,
  maxHeight: 900,
} as const;

export const BEAT_CONTEXT_NO_CHARACTER_MARKER = '__NO_CHARACTER__';
export const BEAT_CONTEXT_NO_PROP_MARKER = '__NO_PROP__';
export const BEAT_CONTEXT_NONE_SENTINEL = '__none__';
export const BEAT_CONTEXT_MENTION_LIMIT = 8;

export type BeatContextMentionKind = 'identity' | 'prop';

export interface BeatContextMentionCandidate {
  kind: BeatContextMentionKind;
  id: string;
  label: string;
  token: string;
}

export interface BeatContextMentionContext {
  start: number;
  end: number;
  query: string;
}

export interface BeatContextSelectableToken {
  id: string;
  stale: boolean;
}

export type StandaloneBeatContextPatch = Partial<{
  visual_description: string;
  detected_identities: string[];
  detected_props: string[];
  sketch_colors: Record<string, string>;
  prop_marker_colors: Record<string, string>;
}>;

function dataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function optionalDataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function stringMap(value: unknown): Record<string, string> | undefined {
  const record = optionalDataRecord(value);
  if (!record) return undefined;
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, String(item)]),
  );
}

export function coerceBeatContextStringList(values: unknown): string[] {
  return Array.isArray(values) ? values.map(String).filter(Boolean) : [];
}

export function areBeatContextListsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function toggleBeatContextSelection(
  current: readonly string[],
  id: string,
  emptyMarker: string,
): string[] {
  const currentReal = current.filter(
    (value) => value && value !== emptyMarker,
  );
  if (id === emptyMarker) return [emptyMarker];
  if (current.includes(id)) {
    const next = currentReal.filter((value) => value !== id);
    return next.length > 0 ? next : [emptyMarker];
  }
  return [...currentReal, id];
}

export function addBeatContextSelection(
  current: readonly string[],
  id: string,
  emptyMarker: string,
): string[] {
  const currentReal = current.filter(
    (value) => value && value !== emptyMarker,
  );
  return currentReal.includes(id) ? currentReal : [...currentReal, id];
}

export function detectBeatContextMention(
  text: string,
  caret: number,
): BeatContextMentionContext | null {
  const prefix = text.slice(0, caret);
  const match = prefix.match(/@([^\s@{}[\]]*)$/u);
  if (!match) return null;
  const start = prefix.length - match[0].length;
  if (
    start > 0 &&
    !/[\s，。、“”（）()[\]{}:：;；,]/u.test(prefix[start - 1])
  ) {
    return null;
  }
  return { start, end: caret, query: match[1].toLowerCase() };
}

export function isStandaloneBeatContextData(
  data: BeatContextNodeModelData,
): boolean {
  const hasMainlineBeat = extractMainlineContextsFromNode({ data }).some(
    (context) => context.kind === 'beat',
  );
  if (hasMainlineBeat) return false;
  const beatContext = optionalDataRecord(data.beat_context);
  return (
    data.context_scope === 'standalone' || beatContext?.source === 'standalone'
  );
}

export function resolveBeatContextSnapshot(
  data: BeatContextNodeModelData,
): BeatContextNodeSnapshot {
  const snapshot = data.snapshot ?? {};
  const beatContext = optionalDataRecord(data.beat_context);
  if (!beatContext || !isStandaloneBeatContextData(data)) return snapshot;

  const visualDescription =
    stringValue(beatContext.visual_description) ?? snapshot.visualDescription;
  const markers = parseBeatContextVisualMarkers(visualDescription ?? '');
  const selectedIdentities = coerceBeatContextStringList(
    beatContext.detected_identities,
  ).filter((id) => markers.identities.includes(id));
  const selectedProps = coerceBeatContextStringList(
    beatContext.detected_props,
  ).filter((id) => markers.props.includes(id));
  return {
    ...snapshot,
    visualDescription,
    narrationSegment:
      stringValue(beatContext.narration_segment) ?? snapshot.narrationSegment,
    sceneId: stringValue(beatContext.scene_id) ?? snapshot.sceneId,
    timeOfDay: stringValue(beatContext.time_of_day) ?? snapshot.timeOfDay,
    detectedIdentities: selectedIdentities,
    detectedProps: selectedProps,
    sketchColors: stringMap(beatContext.sketch_colors) ?? snapshot.sketchColors,
    propMarkerColors:
      stringMap(beatContext.prop_marker_colors) ?? snapshot.propMarkerColors,
  };
}

export function buildStandaloneBeatContextPatch(
  data: BeatContextNodeModelData,
  patch: StandaloneBeatContextPatch,
): BeatContextNodePatch {
  const currentBeatContext = optionalDataRecord(data.beat_context) ?? {};
  const nextBeatContext = {
    ...currentBeatContext,
    ...patch,
    schema: stringValue(currentBeatContext.schema) ?? 'beat_context.v1',
    source: 'standalone',
    title: stringValue(currentBeatContext.title) ?? '自定义镜头上下文',
  };
  const snapshot = { ...(data.snapshot ?? {}) };
  if (patch.visual_description !== undefined) {
    snapshot.visualDescription = patch.visual_description;
  }
  if (patch.detected_identities !== undefined) {
    snapshot.detectedIdentities = patch.detected_identities;
  }
  if (patch.detected_props !== undefined) {
    snapshot.detectedProps = patch.detected_props;
  }
  if (patch.sketch_colors !== undefined) {
    snapshot.sketchColors = patch.sketch_colors;
  }
  if (patch.prop_marker_colors !== undefined) {
    snapshot.propMarkerColors = patch.prop_marker_colors;
  }
  return {
    beat_context: nextBeatContext,
    content:
      patch.visual_description ??
      (typeof data.content === "string" ? data.content : undefined),
    snapshot,
    syncStatus: 'fresh',
    errorMessage: '',
  };
}

function isBadAutoProjectionNode(node: BeatContextGraphNode): boolean {
  return dataRecord(node.data).autoBeatContextProjection === true;
}

function isBadAutoProjectionEdge(edge: BeatContextGraphEdge): boolean {
  return dataRecord(edge.data).autoBeatContextProjection === true;
}

export function mergeRestoredBeatContextCanvas(
  remoteNodes: BeatContextGraphNode[],
  remoteEdges: BeatContextGraphEdge[],
  localNodes: BeatContextGraphNode[],
  localEdges: BeatContextGraphEdge[],
): { nodes: BeatContextGraphNode[]; edges: BeatContextGraphEdge[] } {
  const remoteNodeIds = new Set(remoteNodes.map((node) => node.id));
  const remoteEdgeIds = new Set(remoteEdges.map((edge) => edge.id));
  const preservedNodes = localNodes.filter(
    (node) =>
      !remoteNodeIds.has(node.id) &&
      !isPresetManagedNode(node) &&
      !isBadAutoProjectionNode(node),
  );
  const finalNodeIds = new Set([
    ...remoteNodes.map((node) => node.id),
    ...preservedNodes.map((node) => node.id),
  ]);
  const preservedEdges = localEdges.filter((edge) => {
    if (remoteEdgeIds.has(edge.id)) return false;
    if (isPresetManagedEdge(edge) || isBadAutoProjectionEdge(edge)) {
      return false;
    }
    return finalNodeIds.has(edge.source) && finalNodeIds.has(edge.target);
  });
  return {
    nodes: [...remoteNodes, ...preservedNodes],
    edges: [...remoteEdges, ...preservedEdges],
  };
}

export function mergeBeatContextRefreshPatch(
  refreshPatch: BeatContextNodePatch,
  localPatch?: BeatUpdate,
): BeatContextNodePatch {
  if (!localPatch) return refreshPatch;
  const snapshot = { ...(refreshPatch.snapshot ?? {}) };
  const beatEditFields = { ...(refreshPatch.beat_edit_fields ?? {}) };

  if (localPatch.visual_description !== undefined) {
    snapshot.visualDescription = localPatch.visual_description ?? '';
    refreshPatch.content = localPatch.visual_description ?? '';
    beatEditFields.visual_description = localPatch.visual_description ?? '';
  }
  if (localPatch.scene_ref !== undefined) {
    const sceneId = localPatch.scene_ref?.scene_id ?? '';
    const sceneVariantId = localPatch.scene_ref?.variant_id ?? '';
    snapshot.sceneId = sceneId;
    snapshot.sceneVariantId = sceneVariantId;
    beatEditFields.scene_id = sceneId;
    beatEditFields.scene_variant_id = sceneVariantId;
  }
  if (localPatch.time_of_day !== undefined) {
    snapshot.timeOfDay = localPatch.time_of_day ?? '';
    beatEditFields.time_of_day = localPatch.time_of_day ?? '';
  }
  if (localPatch.detected_identities !== undefined) {
    snapshot.detectedIdentities = localPatch.detected_identities ?? [];
    beatEditFields.detected_identities =
      localPatch.detected_identities ?? [];
  }
  if (localPatch.detected_props !== undefined) {
    snapshot.detectedProps = localPatch.detected_props ?? [];
    beatEditFields.detected_props = localPatch.detected_props ?? [];
  }
  return { ...refreshPatch, snapshot, beat_edit_fields: beatEditFields };
}

export function buildLocalBeatContextPatch(
  data: BeatContextNodeModelData,
  localPatch: BeatUpdate,
): BeatContextNodePatch {
  return mergeBeatContextRefreshPatch(
    {
      content: typeof data.content === "string" ? data.content : undefined,
      snapshot: { ...(data.snapshot ?? {}) },
      beat_edit_fields: { ...(data.beat_edit_fields ?? {}) },
      syncStatus: 'stale',
      errorMessage: '',
    },
    localPatch,
  );
}

export function buildBeatUpdatePayloadFromNodeData(
  data: BeatContextNodeModelData,
): BeatUpdate {
  const snapshot = data.snapshot ?? {};
  const editFields = data.beat_edit_fields ?? {};
  const visualDescription = String(
    editFields.visual_description ??
      snapshot.visualDescription ??
      data.content ??
      '',
  );
  const rawSceneId = String(editFields.scene_id ?? snapshot.sceneId ?? '');
  const sceneVariantId = String(
    editFields.scene_variant_id ?? snapshot.sceneVariantId ?? '',
  );
  const sceneRef = sceneVariantId
    ? { scene_id: rawSceneId, variant_id: sceneVariantId }
    : sceneNameToRef(rawSceneId);
  const timeOfDay = String(
    editFields.time_of_day ?? snapshot.timeOfDay ?? '',
  );
  return {
    visual_description: visualDescription,
    scene_ref: sceneRef,
    time_of_day: timeOfDay,
    detected_identities: coerceBeatContextStringList(
      editFields.detected_identities ?? snapshot.detectedIdentities ?? [],
    ),
    detected_props: coerceBeatContextStringList(
      editFields.detected_props ?? snapshot.detectedProps ?? [],
    ),
  };
}

function looksLikeEpBeatTitle(value: string): boolean {
  return /^EP(?:\d+|\?)\s*\/\s*Beat\s*(?:\d+|\?)$/iu.test(value);
}

export function resolveBeatContextTitle(data: BeatContextNodeModelData): string {
  const customTitle =
    typeof data.displayName === 'string' ? data.displayName.trim() : '';
  if (isStandaloneBeatContextData(data)) {
    const beatContext = optionalDataRecord(data.beat_context);
    const beatContextTitle = stringValue(beatContext?.title)?.trim();
    if (beatContextTitle) return beatContextTitle;
    if (
      customTitle &&
      customTitle !== 'Beat Context' &&
      !looksLikeEpBeatTitle(customTitle)
    ) {
      return customTitle;
    }
    return '自定义镜头上下文';
  }
  if (customTitle && customTitle !== 'Beat Context') return customTitle;
  const contexts = extractMainlineContextsFromNode({ data });
  const beatContext = contexts.find((context) => context.kind === 'beat');
  const episode =
    typeof data.episode === 'number' ? data.episode : beatContext?.episode;
  const beat = typeof data.beat === 'number' ? data.beat : beatContext?.beat;
  const episodeLabel = typeof episode === 'number' ? `EP${episode}` : 'EP?';
  const beatLabel = typeof beat === 'number' ? `Beat ${beat}` : 'Beat ?';
  return `${episodeLabel} / ${beatLabel}`;
}

export function resolveBeatContextWorkbenchTarget(
  data: BeatContextNodeModelData,
): { scope: 'beat'; episode: number; beat: number } | null {
  const raw = data.workbench_target;
  if (!raw || typeof raw !== 'object') return null;
  const target = raw as {
    scope?: unknown;
    episode?: unknown;
    beat?: unknown;
  };
  if (
    target.scope !== 'beat' ||
    typeof target.episode !== 'number' ||
    typeof target.beat !== 'number'
  ) {
    return null;
  }
  return { scope: 'beat', episode: target.episode, beat: target.beat };
}

export function resolveBeatContextNodeSize(
  width: number | undefined,
  height: number | undefined,
): { width: number; height: number } {
  return {
    width:
      typeof width === 'number'
        ? width
        : BEAT_CONTEXT_NODE_SIZE_LIMITS.defaultWidth,
    height:
      typeof height === 'number'
        ? height
        : BEAT_CONTEXT_NODE_SIZE_LIMITS.defaultHeight,
  };
}

export function projectBeatContextMentionCandidates({
  standalone,
  identityIds,
  propIds,
}: {
  standalone: boolean;
  identityIds: readonly string[];
  propIds: readonly string[];
}): BeatContextMentionCandidate[] {
  if (standalone) {
    return [
      {
        kind: 'identity',
        id: 'identity-template',
        label: '人物',
        token: '{{}}',
      },
      {
        kind: 'prop',
        id: 'prop-template',
        label: '道具',
        token: '[[]]',
      },
    ];
  }
  return [
    ...identityIds.map((identityId) => ({
      kind: 'identity' as const,
      id: identityId,
      label: identityId,
      token: `{{${identityId}}}`,
    })),
    ...propIds.map((propId) => ({
      kind: 'prop' as const,
      id: propId,
      label: propId,
      token: `[[${propId}]]`,
    })),
  ];
}

export function filterBeatContextMentionCandidates(
  candidates: readonly BeatContextMentionCandidate[],
  context: BeatContextMentionContext | null,
): BeatContextMentionCandidate[] {
  if (!context) return [];
  return candidates
    .filter((candidate) => {
      if (!context.query) return true;
      return `${candidate.id} ${candidate.label}`
        .toLowerCase()
        .includes(context.query);
    })
    .slice(0, BEAT_CONTEXT_MENTION_LIMIT);
}

export function projectBeatContextSelectableTokens(
  options: readonly string[],
  selected: readonly string[],
  emptyMarker: string,
): {
  selected: string[];
  tokens: BeatContextSelectableToken[];
} {
  const selectedForRender =
    selected.includes(emptyMarker) ||
    selected.some((id) => id && id !== emptyMarker)
      ? [...selected]
      : [emptyMarker];
  const seen = new Set<string>();
  const tokens: BeatContextSelectableToken[] = [];
  for (const id of options) {
    if (seen.has(id)) continue;
    seen.add(id);
    tokens.push({ id, stale: false });
  }
  for (const id of selectedForRender) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    tokens.push({ id, stale: true });
  }
  return { selected: selectedForRender, tokens };
}
