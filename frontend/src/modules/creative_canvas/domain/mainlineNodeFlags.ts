// Copyright (c) 2026 AI anime
import { isCanonicalPushTarget } from "./pushTarget";

export interface MainlineNodeLike {
  data: unknown;
}

export interface MainlineEdgeLike {
  data?: unknown;
  targetHandle?: unknown;
}

export interface MainlineNodeFlags {
  isPresetManaged: boolean;
  isUserSpawned: boolean;
  hasMainlineContext: boolean;
  hasSlotTarget: boolean;
  hasCommittedSlot: boolean;
  hasCommittedAt: boolean;
}

function isNoReferenceValue(value: unknown): boolean {
  return value === "__NO_CHARACTER__" || value === "__NO_PROP__";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNoReferenceNodeData(data: unknown): boolean {
  const value = recordValue(data);
  if (!value) return false;
  if (
    isNoReferenceValue(value.label) ||
    isNoReferenceValue(value.displayName) ||
    isNoReferenceValue(value.content) ||
    isNoReferenceValue(value.prompt)
  ) {
    return true;
  }
  const referenceTarget = recordValue(value.reference_target);
  if (
    referenceTarget?.identity_id === "__NO_CHARACTER__" ||
    referenceTarget?.prop_id === "__NO_PROP__"
  ) {
    return true;
  }
  const freezoneSource = recordValue(value.__freezone_source);
  const meta = recordValue(freezoneSource?.meta);
  return (
    meta?.identity_id === "__NO_CHARACTER__" ||
    meta?.prop_id === "__NO_PROP__"
  );
}

export function nodeMainlineFlags(node: MainlineNodeLike): MainlineNodeFlags {
  const data = recordValue(node.data) ?? {};
  return {
    isPresetManaged: data.preset_managed === true,
    isUserSpawned: data.user_spawned === true,
    hasMainlineContext:
      Array.isArray(data.mainline_context) && data.mainline_context.length > 0,
    hasSlotTarget: isCanonicalPushTarget(data.slot_target),
    hasCommittedSlot:
      typeof data.committed_slot_url === "string" &&
      data.committed_slot_url.length > 0,
    hasCommittedAt:
      typeof data.committed_at === "string" && data.committed_at.length > 0,
  };
}

export function isPresetManagedNode(node: MainlineNodeLike): boolean {
  return (
    !isNoReferenceNodeData(node.data) &&
    nodeMainlineFlags(node).isPresetManaged
  );
}

export function isSystemManagedNodeData(data: unknown): boolean {
  const value = recordValue(data);
  if (!value || isNoReferenceNodeData(data) || value.user_spawned === true) {
    return false;
  }
  return (
    value.preset_managed === true ||
    (typeof value.projection_key === "string" &&
      value.projection_key.trim().length > 0)
  );
}

export function isPresetManagedEdge(edge: MainlineEdgeLike): boolean {
  const data = recordValue(edge.data);
  const targetHandle =
    typeof edge.targetHandle === "string" ? edge.targetHandle.trim() : "";
  const referenceTarget = recordValue(data?.reference_target);
  if (
    targetHandle === "identity:__NO_CHARACTER__" ||
    targetHandle === "prop:__NO_PROP__" ||
    referenceTarget?.identity_id === "__NO_CHARACTER__" ||
    referenceTarget?.prop_id === "__NO_PROP__"
  ) {
    return false;
  }
  if (data?.user_spawned === true) return false;
  return (
    data?.preset_managed === true ||
    (typeof data?.projection_key === "string" &&
      data.projection_key.trim().length > 0)
  );
}

export type MainlineNodeVisualState =
  | "preset_locked"
  | "candidate_pushable"
  | "context_only"
  | "ordinary";

export function mainlineNodeVisualState(
  flags: MainlineNodeFlags,
): MainlineNodeVisualState {
  if (flags.isPresetManaged) return "preset_locked";
  if (flags.isUserSpawned && flags.hasSlotTarget && !flags.hasCommittedAt) {
    return "candidate_pushable";
  }
  if (flags.hasMainlineContext) return "context_only";
  return "ordinary";
}
