// Copyright (c) 2026 AI anime
import type { CanvasNode } from "@/features/canvas/domain/canvasNodes";
import {
  extractMainlineContextsFromNode,
  type MainlineContext,
} from "@/modules/creative_canvas/public";

export type NodeActionBeatContext = MainlineContext & {
  projectId: string;
  episode: number;
  beat: number;
};

const BEAT_CONTEXT_SOURCE_KINDS = new Set([
  "beat",
  "sketch",
  "frame",
  "video",
  "audio",
  "director_combined",
  "selected_background",
]);

const BEAT_SCOPED_SOURCE_ROLES = new Set([
  "current_sketch",
  "current_frame",
  "current_video",
  "current_audio",
  "selected_background",
  "director_combined",
]);

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringArrayOrUndefined(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : undefined;
}

function beatContextLabel(episode: number, beat: number): string {
  return `EP${episode} / Beat ${beat}`;
}

function beatContextFromRecord(
  raw: unknown,
  projectFallback?: string,
): NodeActionBeatContext | null {
  const record = recordOrNull(raw);
  if (!record || record.kind !== "beat") return null;
  const projectId = stringOrUndefined(record.projectId) ?? projectFallback;
  const episode = numberOrUndefined(record.episode);
  const beat = numberOrUndefined(record.beat);
  if (!projectId || episode === undefined || beat === undefined) return null;
  return {
    ...(record as MainlineContext),
    kind: "beat",
    projectId,
    episode,
    beat,
    role: "beat_context",
    label: stringOrUndefined(record.label) ?? beatContextLabel(episode, beat),
  };
}

function beatContextFromParts(
  projectId: string | undefined,
  episode: number | undefined,
  beat: number | undefined,
  meta: Record<string, unknown> | null,
): NodeActionBeatContext | null {
  if (!projectId || episode === undefined || beat === undefined) return null;
  return {
    kind: "beat",
    projectId,
    episode,
    beat,
    role: "beat_context",
    label: beatContextLabel(episode, beat),
    visualDescription: stringOrUndefined(meta?.visual_description),
    narrationSegment: stringOrUndefined(meta?.narration_segment),
    sceneId: stringOrUndefined(meta?.scene_id),
    detectedIdentities: stringArrayOrUndefined(meta?.detected_identities),
    detectedProps: stringArrayOrUndefined(meta?.detected_props),
    sketchColors:
      (recordOrNull(meta?.sketch_colors) as Record<string, string> | null) ??
      undefined,
    propMarkerColors:
      (recordOrNull(meta?.prop_marker_colors) as Record<string, string> | null) ??
      undefined,
  };
}

export function resolveNodeActionBeatContext(
  node: CanvasNode,
  routeProjectId?: string | null,
): NodeActionBeatContext | null {
  const data = recordOrNull(node.data) ?? {};
  const source = recordOrNull(data.__freezone_source);
  const projectFallback =
    stringOrUndefined(source?.projectId) ??
    stringOrUndefined(data.projectId) ??
    routeProjectId ??
    undefined;

  const explicit =
    beatContextFromRecord(source?.beat_context, projectFallback) ??
    beatContextFromRecord(data.beat_context, projectFallback);
  if (explicit) return explicit;

  const contexts = extractMainlineContextsFromNode(node);
  const direct = contexts.find(
    (context): context is NodeActionBeatContext =>
      context.kind === "beat" &&
      typeof context.projectId === "string" &&
      typeof context.episode === "number" &&
      typeof context.beat === "number",
  );
  if (direct) return direct;

  const slotContext = contexts.find(
    (context) =>
      BEAT_CONTEXT_SOURCE_KINDS.has(context.kind) &&
      typeof context.projectId === "string" &&
      typeof context.episode === "number" &&
      typeof context.beat === "number",
  );
  if (slotContext) {
    return {
      ...slotContext,
      kind: "beat",
      role: "beat_context",
      label:
        stringOrUndefined(slotContext.label) ??
        beatContextLabel(
          slotContext.episode as number,
          slotContext.beat as number,
        ),
      sourceUrl: undefined,
    } as NodeActionBeatContext;
  }

  const sourceRole = stringOrUndefined(source?.role);
  const sourceKind = stringOrUndefined(source?.kind);
  const beatScoped = Boolean(
    sourceRole && BEAT_SCOPED_SOURCE_ROLES.has(sourceRole),
  ) || Boolean(sourceKind && ["video", "audio"].includes(sourceKind));
  if (!beatScoped) return null;

  return beatContextFromParts(
    projectFallback,
    numberOrUndefined(source?.episode),
    numberOrUndefined(source?.beat),
    recordOrNull(source?.meta),
  );
}

export function isSameNodeActionBeatContext(
  candidate: MainlineContext,
  target: NodeActionBeatContext,
): boolean {
  return (
    candidate.kind === "beat" &&
    candidate.projectId === target.projectId &&
    candidate.episode === target.episode &&
    candidate.beat === target.beat
  );
}

function beatContextText(context: NodeActionBeatContext): string {
  return [
    `Episode: ${context.episode}`,
    `Beat: ${context.beat}`,
    context.visualDescription ? `Visual: ${context.visualDescription}` : "",
    context.narrationSegment ? `Narration: ${context.narrationSegment}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildNodeActionBeatContextData(
  context: NodeActionBeatContext,
): Record<string, unknown> {
  return {
    displayName: `镜头上下文 · EP${context.episode}/B${context.beat}`,
    content: beatContextText(context),
    projectId: context.projectId,
    episode: context.episode,
    beat: context.beat,
    context_scope: "mainline",
    beat_context: undefined,
    snapshot: {
      visualDescription: context.visualDescription ?? "",
      narrationSegment: context.narrationSegment ?? "",
      sceneId: context.sceneId ?? "",
      detectedIdentities: context.detectedIdentities ?? [],
      detectedProps: context.detectedProps ?? [],
      sketchColors: context.sketchColors ?? {},
      propMarkerColors: context.propMarkerColors ?? {},
    },
    mainline_context: [context],
    beat_edit_fields: {
      visual_description: context.visualDescription ?? "",
      scene_id: context.sceneId ?? "",
      time_of_day: "",
      detected_identities: context.detectedIdentities ?? [],
      detected_props: context.detectedProps ?? [],
    },
  };
}
