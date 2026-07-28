// Copyright (c) 2026 AI anime
import type { SuperChatSettings } from "@/features/superchat/types";
import { safeLocalStorageSet } from "@/lib/localStorageQuota";

const SETTINGS_KEY = "superchat:settings";
const MESSAGE_SET_PREFIX = "superchat:";

type MessageSetKind = "pinned" | "deleted";

type ScopedMessageIds = {
  pinnedIds: Set<string>;
  deletedIds: Set<string>;
};

function messageSetKey(scopeKey: string, kind: MessageSetKind): string {
  return `${MESSAGE_SET_PREFIX}${kind}:${scopeKey}`;
}

export function loadSuperChatSettings(): SuperChatSettings {
  try {
    const raw = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) || "{}",
    ) as Partial<SuperChatSettings>;
    return {
      showToolEvents: raw.showToolEvents ?? false,
      showStructuredSourceWhileStreaming: raw.showStructuredSourceWhileStreaming ?? true,
    };
  } catch {
    return {
      showToolEvents: false,
      showStructuredSourceWhileStreaming: true,
    };
  }
}

export function saveSuperChatSettings(settings: SuperChatSettings): void {
  safeLocalStorageSet(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadScopedMessageIds(scopeKey: string): ScopedMessageIds {
  try {
    const pinned = JSON.parse(
      localStorage.getItem(messageSetKey(scopeKey, "pinned")) || "[]",
    ) as unknown;
    const deleted = JSON.parse(
      localStorage.getItem(messageSetKey(scopeKey, "deleted")) || "[]",
    ) as unknown;
    return {
      pinnedIds: new Set(Array.isArray(pinned) ? pinned : []),
      deletedIds: new Set(Array.isArray(deleted) ? deleted : []),
    };
  } catch {
    return {
      pinnedIds: new Set(),
      deletedIds: new Set(),
    };
  }
}

export function saveScopedMessageIds(
  scopeKey: string,
  kind: MessageSetKind,
  ids: Set<string>,
): void {
  safeLocalStorageSet(messageSetKey(scopeKey, kind), JSON.stringify([...ids]));
}
