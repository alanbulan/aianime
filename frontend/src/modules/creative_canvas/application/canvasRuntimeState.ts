// Copyright (c) 2026 AI anime
import type { FreezoneCanvasPayload } from "@/modules/creative_canvas/domain/canvasStorage";

export type RemoteCanvasMerge<TNode = unknown, TEdge = unknown> = (
  remoteNodes: TNode[],
  remoteEdges: TEdge[],
  localNodes: TNode[],
  localEdges: TEdge[],
) => { nodes: TNode[]; edges: TEdge[] };

type RemoteCanvasApplier<TNode = unknown, TEdge = unknown> = (
  remote: FreezoneCanvasPayload,
  merge?: RemoteCanvasMerge<TNode, TEdge>,
) => void;

type CanvasFlush = () => Promise<boolean>;

export interface LocalProjectionPayload<TNode = unknown, TEdge = unknown> {
  projectionKey: string;
  nodes: TNode[];
  edges: TEdge[];
  metadata?: Record<string, unknown> | null;
}

type LocalProjectionApplier<TNode = unknown, TEdge = unknown> = (
  projection: LocalProjectionPayload<TNode, TEdge>,
) => boolean;
type LocalProjectionRemover = (projectionKey: string) => boolean;

interface RemoteCanvasRuntime {
  project: string;
  canvasId: string;
  apply: RemoteCanvasApplier;
  flush?: CanvasFlush;
  applyLocalProjection?: LocalProjectionApplier;
  removeLocalProjection?: LocalProjectionRemover;
}

let currentRuntime: RemoteCanvasRuntime | null = null;
const pendingLocalProjections = new Map<string, LocalProjectionPayload[]>();

function runtimeKey(project: string, canvasId: string): string {
  return `${project}\u0000${canvasId}`;
}

export function registerFreezoneCanvasRuntime<
  TNode = unknown,
  TEdge = unknown,
>(
  project: string,
  canvasId: string,
  apply: RemoteCanvasApplier<TNode, TEdge>,
  flush?: CanvasFlush,
  applyLocalProjection?: LocalProjectionApplier<TNode, TEdge>,
  removeLocalProjection?: LocalProjectionRemover,
): () => void {
  const runtime: RemoteCanvasRuntime = {
    project,
    canvasId,
    apply: (remote, merge) =>
      apply(
        remote,
        merge as RemoteCanvasMerge<TNode, TEdge> | undefined,
      ),
    flush,
    applyLocalProjection: applyLocalProjection
      ? (projection) =>
          applyLocalProjection(
            projection as LocalProjectionPayload<TNode, TEdge>,
          )
      : undefined,
    removeLocalProjection,
  };
  currentRuntime = runtime;
  return () => {
    if (currentRuntime === runtime) {
      currentRuntime = null;
    }
  };
}

export function applyRemoteFreezoneCanvas<
  TNode = unknown,
  TEdge = unknown,
>(
  project: string,
  canvasId: string,
  remote: FreezoneCanvasPayload,
  merge?: RemoteCanvasMerge<TNode, TEdge>,
): boolean {
  if (
    !currentRuntime ||
    currentRuntime.project !== project ||
    currentRuntime.canvasId !== canvasId
  ) {
    return false;
  }
  currentRuntime.apply(
    remote,
    merge as RemoteCanvasMerge<unknown, unknown> | undefined,
  );
  return true;
}

export async function flushFreezoneCanvasRuntime(
  project: string,
  canvasId: string,
): Promise<boolean | null> {
  if (
    !currentRuntime ||
    currentRuntime.project !== project ||
    currentRuntime.canvasId !== canvasId
  ) {
    return null;
  }
  if (!currentRuntime.flush) {
    return null;
  }
  return await currentRuntime.flush();
}

export function queueLocalFreezoneProjection<TNode = unknown, TEdge = unknown>(
  project: string,
  canvasId: string,
  projection: LocalProjectionPayload<TNode, TEdge>,
): void {
  const key = runtimeKey(project, canvasId);
  const existing = pendingLocalProjections.get(key) ?? [];
  pendingLocalProjections.set(key, [
    ...existing.filter((item) => item.projectionKey !== projection.projectionKey),
    projection as LocalProjectionPayload,
  ]);
}

export function consumeQueuedLocalFreezoneProjections(
  project: string,
  canvasId: string,
): boolean {
  if (
    !currentRuntime ||
    currentRuntime.project !== project ||
    currentRuntime.canvasId !== canvasId ||
    !currentRuntime.applyLocalProjection
  ) {
    return false;
  }
  const key = runtimeKey(project, canvasId);
  const queued = pendingLocalProjections.get(key);
  if (!queued || queued.length === 0) {
    return false;
  }
  const remaining: LocalProjectionPayload[] = [];
  let applied = false;
  for (const projection of queued) {
    if (currentRuntime.applyLocalProjection(projection)) {
      applied = true;
    } else {
      remaining.push(projection);
    }
  }
  if (remaining.length > 0) {
    pendingLocalProjections.set(key, remaining);
  } else {
    pendingLocalProjections.delete(key);
  }
  return applied;
}

export function removeLocalFreezoneProjection(
  project: string,
  canvasId: string,
  projectionKey: string,
): boolean {
  if (
    !currentRuntime ||
    currentRuntime.project !== project ||
    currentRuntime.canvasId !== canvasId ||
    !currentRuntime.removeLocalProjection
  ) {
    return false;
  }
  return currentRuntime.removeLocalProjection(projectionKey);
}
