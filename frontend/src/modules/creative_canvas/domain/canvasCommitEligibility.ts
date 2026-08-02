// Copyright (c) 2026 AI anime
import { isCanonicalPushTarget } from "./pushTarget";

function getCommitSourceUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  const pick = (key: string): string | null =>
    typeof value[key] === "string" && (value[key] as string).trim().length > 0
      ? (value[key] as string)
      : null;
  return (
    pick("imageUrl") ??
    pick("videoUrl") ??
    pick("audioUrl") ??
    pick("fileUrl") ??
    pick("modelUrl") ??
    pick("plyUrl") ??
    pick("url")
  );
}

export function isCommitCandidateData(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;

  const value = data as {
    preset_managed?: unknown;
    user_spawned?: unknown;
    slot_target?: unknown;
    committed_at?: unknown;
  };

  return (
    value.preset_managed !== true &&
    value.user_spawned === true &&
    isCanonicalPushTarget(value.slot_target) &&
    getCommitSourceUrl(data) !== null &&
    !(
      typeof value.committed_at === "string" && value.committed_at.length > 0
    )
  );
}
