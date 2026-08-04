// Copyright (c) 2026 AI anime
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { upstreamNodesInEdgeOrder } from '../domain/referenceOrdering';

export interface UpstreamGraphNode {
  id: string;
}

export interface UpstreamGraphEdge {
  source: string;
  target: string;
}

export interface UpstreamGraphStore<TNode extends UpstreamGraphNode> {
  nodes: readonly TNode[];
  edges: readonly UpstreamGraphEdge[];
}

export type UpstreamGraphStoreHook<TNode extends UpstreamGraphNode> =
  <TSelected>(
    selector: (state: UpstreamGraphStore<TNode>) => TSelected,
  ) => TSelected;

export interface UpstreamGraphDependencies<
  TNode extends UpstreamGraphNode,
  TContent,
> {
  useStore: UpstreamGraphStoreHook<TNode>;
  projectContent: (node: TNode) => TContent;
  projectImages: (node: TNode) => readonly string[];
}

export function createUseUpstreamGraph<
  TNode extends UpstreamGraphNode,
  TContent,
>({
  useStore,
  projectContent,
  projectImages,
}: UpstreamGraphDependencies<TNode, TContent>) {
  function useUpstreamNodes(nodeId: string): TNode[] {
    return useStore(
      useShallow((state) =>
        upstreamNodesInEdgeOrder(state.nodes, state.edges, nodeId),
      ),
    );
  }

  function useUpstreamContents(nodeId: string): TContent[] {
    const upstreamNodes = useUpstreamNodes(nodeId);
    return useMemo(
      () => upstreamNodes.map(projectContent),
      [upstreamNodes],
    );
  }

  function useUpstreamImages(nodeId: string): string[] {
    const upstreamNodes = useUpstreamNodes(nodeId);
    return useMemo(
      () => [
        ...new Set(upstreamNodes.flatMap((node) => projectImages(node))),
      ],
      [upstreamNodes],
    );
  }

  return {
    useUpstreamNodes,
    useUpstreamContents,
    useUpstreamImages,
  };
}
