// Copyright (c) 2026 AI anime
import type { PushTarget } from "./assetCommit";
import type { MainlineContext } from "./mainlineContext";

export interface MainlineFieldsSource {
  mainline_context?: MainlineContext[];
  slot_target?: PushTarget;
  committed_slot_url?: string;
  projection_key?: string;
}

export interface InheritedMainlineFields {
  user_spawned: true;
  mainline_context?: MainlineContext[];
  slot_target?: PushTarget;
  committed_slot_url?: string;
  source_projection_key?: string;
}

export interface InheritMainlineFieldsOptions {
  inheritSlotTarget?: boolean;
}

export function inheritMainlineFields<T extends Record<string, unknown>>(
  source: { data: MainlineFieldsSource } | null | undefined,
  childPatch: T,
  options: InheritMainlineFieldsOptions = {},
): T & InheritedMainlineFields {
  const { inheritSlotTarget = true } = options;
  const inherited: Record<string, unknown> = { ...childPatch };
  const childProjectionKey =
    typeof inherited.projection_key === "string" &&
    inherited.projection_key.length > 0
      ? inherited.projection_key
      : undefined;

  inherited.user_spawned = true;
  delete inherited.preset_managed;
  delete inherited.projection_key;
  if (childProjectionKey) {
    inherited.source_projection_key = childProjectionKey;
  }

  const sourceData = source?.data;
  if (!sourceData) {
    return inherited as T & InheritedMainlineFields;
  }
  if (
    !inherited.source_projection_key &&
    typeof sourceData.projection_key === "string" &&
    sourceData.projection_key.length > 0
  ) {
    inherited.source_projection_key = sourceData.projection_key;
  }
  if (
    Array.isArray(sourceData.mainline_context) &&
    sourceData.mainline_context.length > 0
  ) {
    inherited.mainline_context = sourceData.mainline_context;
  }
  if (inheritSlotTarget && sourceData.slot_target) {
    inherited.slot_target = sourceData.slot_target;
  }
  if (
    typeof sourceData.committed_slot_url === "string" &&
    sourceData.committed_slot_url.length > 0
  ) {
    inherited.committed_slot_url = sourceData.committed_slot_url;
  }

  return inherited as T & InheritedMainlineFields;
}
