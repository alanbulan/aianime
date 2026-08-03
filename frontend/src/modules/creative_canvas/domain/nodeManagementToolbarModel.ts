// Copyright (c) 2026 AI anime

export interface NodeManagementToolbarFacts {
  projectionKey?: unknown;
  canRemove: boolean;
  sourceUrl?: string | null;
}

export type NodeToolbarRemovalTarget = "node" | "projection";

export interface NodeManagementToolbarProjection {
  projectionKey: string | null;
  removalTarget: NodeToolbarRemovalTarget | null;
  canCommit: boolean;
}

export function projectNodeManagementToolbar(
  facts: NodeManagementToolbarFacts,
): NodeManagementToolbarProjection {
  const projectionKey =
    typeof facts.projectionKey === "string"
      ? facts.projectionKey.trim()
      : null;

  return {
    projectionKey,
    removalTarget: facts.canRemove
      ? projectionKey
        ? "projection"
        : "node"
      : null,
    canCommit: Boolean(facts.sourceUrl),
  };
}
