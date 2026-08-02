// Copyright (c) 2026 AI anime
import { CANVAS_DRAFT_PREFIX } from "@/modules/creative_canvas/domain/canvasStorageRetention";
import {
  isCanvasMutationState,
  type CanvasMutationState,
} from "@/modules/creative_canvas/domain/canvasMutation";

export const CANVAS_DRAFT_MAX_BYTES = 1_500_000;
const CANVAS_DRAFT_VERSION = 1;

export interface CanvasDraftHistorySnapshot<TNode = unknown, TEdge = unknown> {
  nodes: TNode[];
  edges: TEdge[];
}

export interface CanvasDraftHistoryState<TNode = unknown, TEdge = unknown> {
  past: CanvasDraftHistorySnapshot<TNode, TEdge>[];
  future: CanvasDraftHistorySnapshot<TNode, TEdge>[];
}

export interface CanvasDraftInput<TNode = unknown, TEdge = unknown> {
  baseRevision: number | null;
  nodes: TNode[];
  edges: TEdge[];
  viewport: unknown;
  metadata: Record<string, unknown> | null;
  history: CanvasDraftHistoryState<TNode, TEdge> | null;
  mutation: CanvasMutationState;
  updatedAt: number;
}

export interface StoredCanvasDraft<TNode = unknown, TEdge = unknown>
  extends CanvasDraftInput<TNode, TEdge> {
  version: typeof CANVAS_DRAFT_VERSION;
  project: string;
  canvasId: string;
  signature: string;
}

export interface CanvasDraftStorageGateway {
  readDraft<TNode = unknown, TEdge = unknown>(
    project: string,
    canvasId: string,
  ): StoredCanvasDraft<TNode, TEdge> | null;
  writeDraft<TNode = unknown, TEdge = unknown>(
    project: string,
    canvasId: string,
    input: CanvasDraftInput<TNode, TEdge>,
  ): boolean;
  clearDraft(project: string, canvasId: string): void;
}

export function canvasDraftStorageKey(
  project: string,
  canvasId: string,
): string {
  return `${CANVAS_DRAFT_PREFIX}${encodeURIComponent(project)}:${encodeURIComponent(canvasId)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stableCanvasShape(
  nodes: unknown[],
  edges: unknown[],
  metadata: Record<string, unknown> | null,
): unknown {
  return {
    nodes: nodes.map((node) => {
      const value = asRecord(node);
      return {
        id: value.id,
        type: value.type,
        position: value.position,
        width: value.width,
        height: value.height,
        style: value.style,
        parentId: value.parentId,
        extent: value.extent,
        data: value.data,
      };
    }),
    edges: edges.map((edge) => {
      const value = asRecord(edge);
      return {
        id: value.id,
        source: value.source,
        target: value.target,
        sourceHandle: value.sourceHandle,
        targetHandle: value.targetHandle,
        type: value.type,
        data: value.data,
      };
    }),
    metadata: metadata ?? null,
  };
}

export function canvasDraftSignature(
  nodes: unknown[],
  edges: unknown[],
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

export function parseStoredCanvasDraft<TNode = unknown, TEdge = unknown>(
  value: unknown,
  project: string,
  canvasId: string,
): StoredCanvasDraft<TNode, TEdge> | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<StoredCanvasDraft<TNode, TEdge>>;
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
    Array.isArray(
      (draft.history as Partial<CanvasDraftHistoryState<TNode, TEdge>>).past,
    ) &&
    Array.isArray(
      (draft.history as Partial<CanvasDraftHistoryState<TNode, TEdge>>).future,
    )
      ? (draft.history as CanvasDraftHistoryState<TNode, TEdge>)
      : null;
  return {
    version: CANVAS_DRAFT_VERSION,
    project,
    canvasId,
    baseRevision: draft.baseRevision,
    nodes: draft.nodes as TNode[],
    edges: draft.edges as TEdge[],
    viewport: draft.viewport ?? null,
    metadata: (draft.metadata as Record<string, unknown> | null) ?? null,
    history,
    mutation: draft.mutation,
    updatedAt: draft.updatedAt,
    signature: draft.signature,
  };
}

export function createStoredCanvasDraft<TNode = unknown, TEdge = unknown>(
  project: string,
  canvasId: string,
  input: CanvasDraftInput<TNode, TEdge>,
): StoredCanvasDraft<TNode, TEdge> {
  return {
    version: CANVAS_DRAFT_VERSION,
    project,
    canvasId,
    ...input,
    signature: canvasDraftSignature(input.nodes, input.edges, input.metadata),
  };
}
