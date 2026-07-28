// Copyright (c) 2026 AI anime
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useCanvasStore } from '@/features/canvas/canvasStore';
import { extractUpstreamContent } from '../application/graphContentResolver';
import { extractUpstreamImages } from '../application/graphImageResolver';
import type { UpstreamContent } from '../application/ports';
import type { CanvasNode } from '../domain/canvasNodes';
import { upstreamNodesInEdgeOrder } from '../nodes/referenceOrdering';

/**
 * Subscribe to ONLY this node's direct (one-hop) upstream nodes, in edge-
 * connection order — not the whole `nodes` array.
 *
 * Why this exists (perf): React Flow rebuilds the `nodes` array on every drag
 * frame, but `applyNodeChanges` / `updateNodeData` reuse object identity for the
 * nodes that didn't change. A node component that subscribed to the full array
 * therefore re-rendered (and re-walked the graph) on *any* change anywhere on the
 * canvas. By selecting just the upstream node objects under `useShallow`, an
 * unrelated node's drag leaves this result referentially stable, so the consuming
 * node skips the re-render entirely.
 */
export function useUpstreamNodes(nodeId: string): CanvasNode[] {
  return useCanvasStore(
    useShallow((state) =>
      upstreamNodesInEdgeOrder(state.nodes, state.edges, nodeId),
    ),
  );
}

/** One-hop upstream contents (text / image / video / audio), per-node subscribed. */
export function useUpstreamContents(nodeId: string): UpstreamContent[] {
  const upstreamNodes = useUpstreamNodes(nodeId);
  return useMemo(() => upstreamNodes.map(extractUpstreamContent), [upstreamNodes]);
}

/** One-hop upstream referenceable image URLs (deduped), per-node subscribed. */
export function useUpstreamImages(nodeId: string): string[] {
  const upstreamNodes = useUpstreamNodes(nodeId);
  return useMemo(
    () => [...new Set(upstreamNodes.flatMap((node) => extractUpstreamImages(node)))],
    [upstreamNodes],
  );
}
