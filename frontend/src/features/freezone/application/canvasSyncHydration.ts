// Copyright (c) 2026 AI anime
import type {
  CanvasEdge,
  CanvasNode,
} from "@/features/canvas/domain/canvasNodes";

import type { StoredCanvasDraft } from "./canvasDraft";

export type HydrateDraftDecision =
  | { kind: "remote" }
  | { kind: "draft"; draft: StoredCanvasDraft }
  | { kind: "conflict"; draft: StoredCanvasDraft; message: string };

const nodeSignatureCache = new WeakMap<object, string>();
const edgeSignatureCache = new WeakMap<object, string>();

function nodeSignature(node: CanvasNode): string {
  const cached = nodeSignatureCache.get(node);
  if (cached !== undefined) return cached;
  const signature = JSON.stringify({
    id: node.id,
    type: node.type,
    position: node.position,
    width: node.width,
    height: node.height,
    style: node.style,
    parentId: node.parentId,
    extent: node.extent,
    data: node.data,
  });
  nodeSignatureCache.set(node, signature);
  return signature;
}

function edgeSignature(edge: CanvasEdge): string {
  const cached = edgeSignatureCache.get(edge);
  if (cached !== undefined) return cached;
  const signature = JSON.stringify({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: edge.type,
    data: edge.data,
  });
  edgeSignatureCache.set(edge, signature);
  return signature;
}

export function canvasContentSignature(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): string {
  return `${nodes.map(nodeSignature).join("\u0001")}\u0002${edges
    .map(edgeSignature)
    .join("\u0001")}`;
}

function jsonContainsSubset(superset: unknown, subset: unknown): boolean {
  if (subset === undefined) return true;
  if (subset === null || typeof subset !== "object") {
    return Object.is(superset, subset);
  }
  if (Array.isArray(subset)) {
    if (!Array.isArray(superset) || superset.length < subset.length) {
      return false;
    }
    return subset.every((item, index) =>
      jsonContainsSubset(superset[index], item),
    );
  }
  if (!superset || typeof superset !== "object" || Array.isArray(superset)) {
    return false;
  }
  const supersetRecord = superset as Record<string, unknown>;
  const subsetRecord = subset as Record<string, unknown>;
  return Object.keys(subsetRecord).every((key) =>
    jsonContainsSubset(supersetRecord[key], subsetRecord[key]),
  );
}

export function decideHydrateDraft(
  draft: StoredCanvasDraft | null,
  remoteRevision: number | null,
  remoteSignature: string,
  remoteNodes: CanvasNode[],
  remoteEdges: CanvasEdge[],
  remoteMetadata: Record<string, unknown> | null,
): HydrateDraftDecision {
  if (!draft || draft.signature === remoteSignature) {
    return { kind: "remote" };
  }
  const draftContentAlreadySaved =
    canvasContentSignature(draft.nodes, draft.edges) ===
      canvasContentSignature(remoteNodes, remoteEdges) &&
    jsonContainsSubset(remoteMetadata ?? null, draft.metadata ?? null);
  if (draftContentAlreadySaved) {
    return { kind: "remote" };
  }
  if (
    typeof draft.baseRevision === "number" &&
    typeof remoteRevision === "number" &&
    draft.baseRevision === remoteRevision
  ) {
    return { kind: "draft", draft };
  }
  return {
    kind: "conflict",
    draft,
    message:
      "本地有未同步的画布草稿，但服务器版本已经变化。请保存副本或丢弃本地草稿后继续。",
  };
}
