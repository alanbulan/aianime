// Copyright (c) 2026 AI anime
import type {
  CanvasEdge,
  CanvasNode,
} from '@/features/canvas/domain/canvasNodes';
import {
  getCurrentBeatContextFromNode,
  type SceneAssetsForBeat,
  type SkillDefinition,
  type SkillInputRole,
  type SkillRunOutput,
} from '@/features/freezone/public';
import type {
  DirectorControlFrameBundle,
  DirectorStageManifest,
  DirectorWorldSource,
} from '@/features/viewer-kit/three-d/directorManifest';

export const SKILL_NODE_DEFAULT_WIDTH = 380;
export const SKILL_OUTPUT_X_OFFSET = 460;
export const SKILL_OUTPUT_Y_SPACING = 260;
export const SKILL_TASK_RECORD_GRACE_MS = 5000;
export const SELECTED_BACKGROUND_CROP_ASPECT_OPTIONS = ['2:3', '16:9'] as const;

export type SkillDirectorWorldDestination =
  | 'selected_background'
  | 'director_combined';

export interface SkillBeatTarget {
  episode: number;
  beat: number;
}

export interface SkillBeatContextReferences {
  identities: string[];
  props: string[];
  noCharacter: boolean;
  noProp: boolean;
  visualDescription?: string;
}

export interface SkillCropSource {
  url: string;
  label: 'master' | 'reverse' | 'director_background';
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function skillInputSignature(inputs: unknown): string {
  return hashString(stableStringify(inputs));
}

export function createSkillRunNonce(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function skillRunIdempotencyKey(
  canvasId: string,
  nodeId: string,
  skillId: string,
  inputSignature: string,
  runNonce: string,
): string {
  return `skill:${canvasId}:${nodeId}:${skillId}:${inputSignature}:${runNonce}`;
}

export function skillTaskStatusLabelKey(
  task: { status: string } | null,
  submitting: boolean,
  waitingForTaskRecord: boolean,
): string {
  if (submitting || waitingForTaskRecord) {
    return 'viewer.threeD.skillStatus.generating';
  }
  if (!task) {
    return 'viewer.threeD.skillStatus.submit';
  }
  if (task.status === 'queued' || task.status === 'pending') {
    return 'viewer.threeD.skillStatus.queued';
  }
  if (task.status === 'starting') {
    return 'viewer.threeD.skillStatus.starting';
  }
  if (task.status === 'running' || task.status === 'submitting') {
    return 'viewer.threeD.skillStatus.running';
  }
  return 'viewer.threeD.skillStatus.submit';
}

export function skillInputRoleFromEdge(edge: CanvasEdge): string | null {
  const handleRole =
    typeof edge.targetHandle === 'string' ? edge.targetHandle.trim() : '';
  if (handleRole) {
    return handleRole.split(':', 1)[0];
  }
  const dataRole = (edge.data as { role?: unknown } | undefined)?.role;
  return typeof dataRole === 'string' && dataRole.trim()
    ? dataRole.trim()
    : null;
}

export function skillOutputRoleFromEdge(edge: CanvasEdge): string | null {
  const handleRole =
    typeof edge.sourceHandle === 'string' ? edge.sourceHandle.trim() : '';
  if (handleRole) {
    return handleRole;
  }
  const dataRole = (edge.data as { role?: unknown } | undefined)?.role;
  return typeof dataRole === 'string' && dataRole.trim()
    ? dataRole.trim()
    : null;
}

export function resolveSkillInputPreviewUrl(
  node: CanvasNode | undefined,
): string | null {
  if (!node) return null;
  const data = node.data as {
    imageUrl?: unknown;
    previewImageUrl?: unknown;
    referenceImageUrl?: unknown;
  };
  for (const value of [
    data.imageUrl,
    data.previewImageUrl,
    data.referenceImageUrl,
  ]) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

export function resolveSkillInputSourceLabel(
  node: CanvasNode | undefined,
  missingLabel: string,
): string {
  if (!node) return missingLabel;
  const data = node.data as {
    displayName?: unknown;
    label?: unknown;
    content?: unknown;
    prompt?: unknown;
  };
  for (const value of [
    data.displayName,
    data.label,
    data.content,
    data.prompt,
  ]) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return node.type;
}

export function findSkillBoundEdges(
  edges: CanvasEdge[],
  role: SkillInputRole,
): CanvasEdge[] {
  return edges.filter((edge) => skillInputRoleFromEdge(edge) === role);
}

export function nonEmptySkillHandleId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isSkillReferenceInputRole(
  role: string,
): role is 'identity' | 'prop' {
  return role === 'identity' || role === 'prop';
}

export function isNoSkillReferenceHandle(
  handleId: string | null,
  role?: 'identity' | 'prop',
): boolean {
  if (!handleId) return false;
  return (
    (handleId === 'identity:__NO_CHARACTER__' &&
      (!role || role === 'identity')) ||
    (handleId === 'prop:__NO_PROP__' && (!role || role === 'prop'))
  );
}

export function isNoSkillReferenceEdge(
  edge: CanvasEdge,
  role: SkillInputRole,
): boolean {
  if (!isSkillReferenceInputRole(role)) return false;
  const handleId = nonEmptySkillHandleId(edge.targetHandle);
  if (isNoSkillReferenceHandle(handleId, role)) {
    return true;
  }
  const referenceTarget =
    edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data)
      ? (edge.data as Record<string, unknown>).reference_target
      : undefined;
  if (
    !referenceTarget ||
    typeof referenceTarget !== 'object' ||
    Array.isArray(referenceTarget)
  ) {
    return false;
  }
  const target = referenceTarget as Record<string, unknown>;
  return role === 'identity'
    ? target.identity_id === '__NO_CHARACTER__'
    : target.prop_id === '__NO_PROP__';
}

export function skillNodeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function selectedBackgroundTarget(
  output: SkillRunOutput,
): { episode?: unknown; beat?: unknown } | null {
  const target = output.slot_target;
  return target?.kind === 'selected_background' ? target : null;
}

export function skillRecordValue(
  value: unknown,
): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

export function numericSkillField(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function resolveSkillBeatTarget(
  node: CanvasNode | undefined,
): SkillBeatTarget | null {
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const snapshot =
    data.snapshot && typeof data.snapshot === 'object'
      ? (data.snapshot as Record<string, unknown>)
      : undefined;
  const episode =
    numericSkillField(data.episode) ??
    numericSkillField(snapshot?.episode) ??
    numericSkillField(snapshot?.episode_number);
  const beat =
    numericSkillField(data.beat) ??
    numericSkillField(data.beat_number) ??
    numericSkillField(snapshot?.beat) ??
    numericSkillField(snapshot?.beat_number);
  return episode && beat ? { episode, beat } : null;
}

export function skillBeatContextReferences(
  node: CanvasNode | undefined,
): SkillBeatContextReferences {
  const beatContext = getCurrentBeatContextFromNode(node);
  const unique = (items: string[]) => Array.from(new Set(items));
  const identityItems = unique(stringArray(beatContext?.detected_identities));
  const propItems = unique(stringArray(beatContext?.detected_props));
  const visualDescription = String(
    beatContext?.visual_description ?? '',
  ).trim();
  return {
    identities: identityItems.filter((item) => item !== '__NO_CHARACTER__'),
    props: propItems.filter((item) => item !== '__NO_PROP__'),
    noCharacter: identityItems.includes('__NO_CHARACTER__'),
    noProp: propItems.includes('__NO_PROP__'),
    visualDescription: visualDescription || undefined,
  };
}

export function skillReferenceHandleId(
  role: 'identity' | 'prop',
  id: string,
): string {
  return `${role}:${id}`;
}

export function labelFromSkillReferenceHandle(handleId: string): string {
  const separator = handleId.indexOf(':');
  return separator >= 0 ? handleId.slice(separator + 1).trim() : handleId;
}

export function projectSkillInputHandleIds({
  skill,
  skillId,
  references,
  incomingEdges,
}: {
  skill: SkillDefinition | null;
  skillId: string;
  references: SkillBeatContextReferences;
  incomingEdges: CanvasEdge[];
}): string[] {
  const roles = new Set<string>();
  for (const input of skill?.inputs ?? []) {
    if (
      skillId === 'freezone.frame_from_context' &&
      isSkillReferenceInputRole(input.role) &&
      ((input.role === 'identity' && references.identities.length > 0) ||
        (input.role === 'prop' && references.props.length > 0))
    ) {
      continue;
    }
    roles.add(input.role);
  }
  if (skillId === 'freezone.frame_from_context') {
    for (const identityId of references.identities) {
      roles.add(skillReferenceHandleId('identity', identityId));
    }
    for (const propId of references.props) {
      roles.add(skillReferenceHandleId('prop', propId));
    }
  }
  for (const edge of incomingEdges) {
    const handleId = nonEmptySkillHandleId(edge.targetHandle);
    if (handleId && !isNoSkillReferenceHandle(handleId)) {
      roles.add(handleId);
    }
  }
  return Array.from(roles);
}

export function projectSkillReferenceInputHandles({
  skillId,
  references,
  incomingEdges,
}: {
  skillId: string;
  references: SkillBeatContextReferences;
  incomingEdges: CanvasEdge[];
}): Record<'identity' | 'prop', string[]> {
  const handles: Record<'identity' | 'prop', string[]> = {
    identity: [],
    prop: [],
  };
  const add = (role: 'identity' | 'prop', handleId: string) => {
    if (!handles[role].includes(handleId)) {
      handles[role].push(handleId);
    }
  };
  if (skillId === 'freezone.frame_from_context') {
    for (const identityId of references.identities) {
      add('identity', skillReferenceHandleId('identity', identityId));
    }
    for (const propId of references.props) {
      add('prop', skillReferenceHandleId('prop', propId));
    }
  }
  for (const edge of incomingEdges) {
    const handleId = nonEmptySkillHandleId(edge.targetHandle);
    const role = skillInputRoleFromEdge(edge);
    if (handleId?.startsWith('identity:')) {
      if (!isNoSkillReferenceHandle(handleId, 'identity')) {
        add('identity', handleId);
      }
    } else if (handleId?.startsWith('prop:')) {
      if (!isNoSkillReferenceHandle(handleId, 'prop')) {
        add('prop', handleId);
      }
    } else if (role === 'identity' && handleId === 'identity') {
      add('identity', handleId);
    } else if (role === 'prop' && handleId === 'prop') {
      add('prop', handleId);
    }
  }
  return handles;
}

export function projectSkillOutputHandleIds(
  skill: SkillDefinition | null,
  outgoingEdges: CanvasEdge[],
): string[] {
  const roles = new Set<string>();
  for (const output of skill?.outputs ?? []) {
    roles.add(output.role);
  }
  for (const edge of outgoingEdges) {
    const handleId = nonEmptySkillHandleId(edge.sourceHandle);
    if (handleId) {
      roles.add(handleId);
    }
  }
  return Array.from(roles);
}

export function mergeSkillManifestWithBeatContext(
  manifest: DirectorStageManifest,
  beatContextNode: CanvasNode | undefined,
): DirectorStageManifest {
  const target = resolveSkillBeatTarget(beatContextNode);
  const context = skillBeatContextReferences(beatContextNode);
  if (
    !target ||
    (context.identities.length === 0 &&
      context.props.length === 0 &&
      !context.visualDescription)
  ) {
    return manifest;
  }
  return {
    ...manifest,
    mode: 'beat',
    beat_context: {
      episode: target.episode,
      beat: target.beat,
      visual_description:
        context.visualDescription ?? manifest.beat_context?.visual_description,
      detected_identities:
        context.identities.length > 0
          ? context.identities
          : (manifest.beat_context?.detected_identities ?? []),
      detected_props:
        context.props.length > 0
          ? context.props
          : (manifest.beat_context?.detected_props ?? []),
    },
    palette: {
      ...manifest.palette,
      anonymous_colors: [],
    },
  };
}

export function sceneAssetsFromSkillData(
  value: unknown,
): SceneAssetsForBeat | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as Record<string, unknown>;
  const normalizeUrl = (key: string): string | null => {
    const raw = item[key];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  };
  return {
    scene_id:
      typeof item.scene_id === 'string' && item.scene_id.trim()
        ? item.scene_id
        : null,
    master_url: normalizeUrl('master_url'),
    reverse_url: normalizeUrl('reverse_url'),
    director_env_only_url: normalizeUrl('director_env_only_url'),
    pano_360_url: normalizeUrl('pano_360_url'),
    ply_url: null,
  };
}

function directorSourceUrl(source: DirectorWorldSource): string | null {
  return source.pano_url ?? source.ply_url ?? source.url ?? null;
}

export function directorControlBundleFromMeta(
  meta: { controlFrameBundle?: DirectorControlFrameBundle } | undefined,
): DirectorControlFrameBundle | null {
  const bundle = meta?.controlFrameBundle;
  if (
    !bundle?.rel_paths ||
    !bundle.rel_paths.combined ||
    !bundle.rel_paths.env_only ||
    !bundle.rel_paths.frame_meta
  ) {
    return null;
  }
  return bundle;
}

export function directorControlBundleImageUrl(
  bundle: DirectorControlFrameBundle | null,
  kind: 'combined' | 'env_only',
): string {
  return bundle?.urls?.[kind] ?? '';
}

function manifestSourceToWorldSource(
  manifest: DirectorStageManifest,
): DirectorWorldSource {
  return {
    id: `manifest:${manifest.source.source_kind}:${manifest.source.ply_url ?? manifest.source.url ?? manifest.source.pano_url ?? 'source'}`,
    source_type: manifest.source.source_type ?? 'sog',
    source_kind: manifest.source.source_kind,
    label: manifest.source.source_kind,
    ply_url: manifest.source.ply_url,
    url:
      manifest.source.url ??
      manifest.source.ply_url ??
      manifest.source.pano_url,
    pano_url: manifest.source.pano_url,
    pano_fs: manifest.source.pano_fs,
    collision_glb_url: manifest.source.collision_glb_url,
    current: true,
  };
}

function manifestOptionToWorldSource(
  option: NonNullable<DirectorStageManifest['source_options']>[number],
): DirectorWorldSource | null {
  if (option.kind === 'active') return null;
  return {
    id: `option:${option.kind}:${option.ply_url ?? option.url ?? option.pano_url ?? 'source'}`,
    source_type: option.source_type ?? 'sog',
    source_kind: option.kind,
    label: option.label ?? option.kind,
    ply_url: option.ply_url,
    url: option.url ?? option.ply_url ?? option.pano_url,
    pano_url: option.pano_url,
    pano_fs: option.pano_fs,
    slot_kind: option.slot_kind,
    fs: option.fs,
    current: option.current,
  };
}

export function directorManifestWithScenePanoSource(
  manifest: DirectorStageManifest,
  assets: SceneAssetsForBeat | null,
): DirectorStageManifest {
  if (!assets?.pano_360_url) return manifest;
  const sources = manifest.sources?.length
    ? manifest.sources.filter((source) => source.source_type !== 'mesh')
    : [
        manifestSourceToWorldSource(manifest),
        ...(manifest.source_options ?? [])
          .map(manifestOptionToWorldSource)
          .filter((source): source is DirectorWorldSource => source !== null),
      ];
  const panoSource: DirectorWorldSource = {
    id: `scene-pano:${assets.scene_id ?? assets.pano_360_url}`,
    source_type: 'pano360',
    source_kind: 'pano',
    label: '360',
    url: assets.pano_360_url,
    pano_url: assets.pano_360_url,
    slot_kind: 'scene_director_pano_360',
  };
  if (
    !sources.some(
      (source) => directorSourceUrl(source) === assets.pano_360_url,
    )
  ) {
    sources.push(panoSource);
  }
  return {
    ...manifest,
    sources,
    active_source_id:
      manifest.active_source_id ?? sources.find((source) => source.current)?.id,
  };
}

export function resolveSkillNodeWidth(width: number | undefined): number {
  return typeof width === 'number' ? width : SKILL_NODE_DEFAULT_WIDTH;
}

export function projectSkillOutputPositions(
  sourcePosition: { x: number; y: number },
  outputCount: number,
): Array<{ x: number; y: number }> {
  const startY =
    sourcePosition.y -
    (Math.max(0, outputCount - 1) * SKILL_OUTPUT_Y_SPACING) / 2;
  return Array.from({ length: outputCount }, (_, index) => ({
    x: sourcePosition.x + SKILL_OUTPUT_X_OFFSET,
    y: startY + index * SKILL_OUTPUT_Y_SPACING,
  }));
}
