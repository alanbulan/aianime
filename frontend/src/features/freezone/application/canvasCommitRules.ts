// Copyright (c) 2026 AI anime
import type {
  PushResult,
  PushTarget,
  PushTargetKind,
} from "../domain/assetCommit";

import { nodeDataAfterCommittedSlot } from "./committedNodePatch";
import {
  inferDefaultTarget,
  isScenePushTargetKind,
  type FreezoneSource,
} from "../domain/pushTarget";
import {
  hasDirectorWorldSceneState,
  isDirectorWorldSourceSlotTarget,
} from "../domain/directorWorldCommit";

export function renderCommitSuccessMessage(
  target: PushTarget,
  result: PushResult,
): string {
  if (target.kind === "director_render") {
    return `已提交导演合成资产：${result.target_path}（含纯背景和元数据）`;
  }
  if (target.kind === "scene_director_world") {
    return `已提交导演世界：${result.target_path}`;
  }
  return `已提交到 ${result.target_path}` +
    (result.backup ? `(旧文件 backup 至 ${result.backup})` : "") +
    (result.stale_marked ? `；已标记 ${result.stale_marked} 个镜头需重生` : "");
}

export function sceneDirectorWorldDataForManifest(
  nodeData: Record<string, unknown>,
  target: PushTarget,
  result: PushResult,
  projectId?: string,
): Record<string, unknown> | null {
  const manifestNodeData = nodeDataPatchAfterCommittedSourceSlot(
    nodeData,
    target,
    result,
    projectId,
  );
  return hasDirectorWorldSceneState(manifestNodeData) ? manifestNodeData : null;
}

export function nodeDataPatchAfterCommittedSourceSlot(
  nodeData: Record<string, unknown>,
  target: PushTarget,
  result: PushResult,
  projectId?: string,
): Record<string, unknown> | null {
  if (!isDirectorWorldSourceSlotTarget(target)) return null;
  return nodeDataAfterCommittedSlot(nodeData, target, result, projectId);
}

export function nodeDataPatchAfterCommittedTarget(
  nodeData: Record<string, unknown>,
  target: PushTarget,
  result: PushResult,
  projectId?: string,
): Record<string, unknown> | null {
  if (isDirectorWorldSourceSlotTarget(target)) return null;
  return nodeDataAfterCommittedSlot(nodeData, target, result, projectId);
}

export function resolveSubmitNodeData(
  latest: Record<string, unknown> | null | undefined,
  fallback: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return latest ?? fallback ?? null;
}

export function shouldRefreshCommittedTargetNodes(target: PushTarget): boolean {
  // Director World commits persist a structured manifest rather than a media
  // URL, so projecting the result onto a visual node would corrupt its preview.
  return target.kind !== "scene_director_world";
}

export function normalizePushTarget(
  target: (Partial<PushTarget> & { kind?: PushTargetKind }) | null,
): (Partial<PushTarget> & { kind: PushTargetKind }) | null {
  if (!target?.kind) return null;
  return target as Partial<PushTarget> & { kind: PushTargetKind };
}

export function inferCanonicalRefreshTarget(
  source: FreezoneSource | undefined,
): (Partial<PushTarget> & { kind: PushTargetKind }) | undefined {
  if (!source?.kind) return undefined;
  return inferDefaultTarget(source);
}

export function pushTargetsEqual(
  left: Partial<PushTarget> & { kind: PushTargetKind },
  right: PushTarget,
): boolean {
  if (left.kind !== right.kind) return false;
  const leftRecord = left as Record<string, unknown>;
  if (
    right.kind === "frame" ||
    right.kind === "sketch" ||
    right.kind === "director_render" ||
    right.kind === "selected_background" ||
    right.kind === "video" ||
    right.kind === "beat_audio"
  ) {
    return leftRecord.episode === right.episode && leftRecord.beat === right.beat;
  }
  if (
    right.kind === "identity" ||
    right.kind === "identity_costume" ||
    right.kind === "identity_portrait"
  ) {
    return (
      leftRecord.character === right.character &&
      leftRecord.identity_id === right.identity_id
    );
  }
  if (right.kind === "portrait") {
    return leftRecord.character === right.character;
  }
  if (isScenePushTargetKind(right.kind)) {
    return leftRecord.scene_id === (right as unknown as Record<string, unknown>).scene_id;
  }
  if (right.kind === "prop_ref") {
    return leftRecord.prop_id === right.prop_id;
  }
  return false;
}

export function defaultCharacterFromMetadata(
  metadata: Record<string, unknown> | null,
): string | null {
  const preset = metadata?.preset as { character?: unknown } | undefined;
  return typeof preset?.character === "string" && preset.character
    ? preset.character
    : null;
}
