// Copyright (c) 2026 AI anime
import type {
  CanvasEdge,
  CanvasNode,
} from "@/features/canvas/domain/canvasNodes";
import type { CanvasHistoryState } from "@/features/canvas/domain/canvasHistory";
import {
  isCanvasMutationState,
  type CanvasMutationState,
} from "@/features/canvas/domain/canvasMutation";

export const CANVAS_DRAFT_MAX_BYTES = 1_500_000;
export const CANVAS_DRAFT_PREFIX = "ai-anime-freezone:canvas-draft:";
export const FREEZONE_CANVAS_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const CANVAS_DRAFT_VERSION = 1;

export interface CanvasDraftInput {
  baseRevision: number | null;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: unknown;
  metadata: Record<string, unknown> | null;
  history: CanvasHistoryState | null;
  mutation: CanvasMutationState;
  updatedAt: number;
}

export interface StoredCanvasDraft extends CanvasDraftInput {
  version: typeof CANVAS_DRAFT_VERSION;
  project: string;
  canvasId: string;
  signature: string;
}

export interface CanvasDraftStorageGateway {
  readDraft(project: string, canvasId: string): StoredCanvasDraft | null;
  writeDraft(
    project: string,
    canvasId: string,
    input: CanvasDraftInput,
  ): boolean;
  clearDraft(project: string, canvasId: string): void;
  prune(now?: number): void;
}

export function canvasDraftStorageKey(
  project: string,
  canvasId: string,
): string {
  return `${CANVAS_DRAFT_PREFIX}${encodeURIComponent(project)}:${encodeURIComponent(canvasId)}`;
}

function stableCanvasShape(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  metadata: Record<string, unknown> | null,
): unknown {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      width: node.width,
      height: node.height,
      style: node.style,
      parentId: node.parentId,
      extent: node.extent,
      data: node.data,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type,
      data: edge.data,
    })),
    metadata: metadata ?? null,
  };
}

export function canvasDraftSignature(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  metadata: Record<string, unknown> | null,
): string {
  return stableStringify(stableCanvasShape(nodes, edges, metadata));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    const item = input[key];
    if (item !== undefined) {
      output[key] = sortJsonValue(item);
    }
  }
  return output;
}

export function parseStoredCanvasDraft(
  value: unknown,
  project: string,
  canvasId: string,
): StoredCanvasDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<StoredCanvasDraft>;
  if (
    draft.version !== CANVAS_DRAFT_VERSION ||
    draft.project !== project ||
    draft.canvasId !== canvasId ||
    !Array.isArray(draft.nodes) ||
    !Array.isArray(draft.edges) ||
    typeof draft.signature !== "string" ||
    typeof draft.updatedAt !== "number" ||
    !(typeof draft.baseRevision === "number" || draft.baseRevision === null) ||
    !isCanvasMutationState(draft.mutation)
  ) {
    return null;
  }
  const history =
    draft.history &&
    typeof draft.history === "object" &&
    Array.isArray((draft.history as Partial<CanvasHistoryState>).past) &&
    Array.isArray((draft.history as Partial<CanvasHistoryState>).future)
      ? (draft.history as CanvasHistoryState)
      : null;
  return {
    version: CANVAS_DRAFT_VERSION,
    project,
    canvasId,
    baseRevision: draft.baseRevision,
    nodes: draft.nodes as CanvasNode[],
    edges: draft.edges as CanvasEdge[],
    viewport: draft.viewport ?? null,
    metadata: (draft.metadata as Record<string, unknown> | null) ?? null,
    history,
    mutation: draft.mutation,
    updatedAt: draft.updatedAt,
    signature: draft.signature,
  };
}

export function createStoredCanvasDraft(
  project: string,
  canvasId: string,
  input: CanvasDraftInput,
): StoredCanvasDraft {
  return {
    version: CANVAS_DRAFT_VERSION,
    project,
    canvasId,
    ...input,
    signature: canvasDraftSignature(input.nodes, input.edges, input.metadata),
  };
}
