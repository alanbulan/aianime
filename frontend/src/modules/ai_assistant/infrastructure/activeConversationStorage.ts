// Copyright (c) 2026 AI anime
import { safeLocalStorageSet } from "@/shared/localStorageQuota";

const ACTIVE_CONVERSATION_PREFIX = "superchat:active-conversation:v1:";
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

interface ActiveConversationSnapshot {
  version: 1;
  conversationId: string;
}

export function activeConversationScopeKey(
  username: string,
  project?: string,
): string {
  const account = username.trim() || "anonymous";
  const scope = project?.trim() ? `project:${project.trim()}` : "home";
  return `${account}:${scope}`;
}

function storageKey(scopeKey: string): string {
  return `${ACTIVE_CONVERSATION_PREFIX}${scopeKey}`;
}

export function loadActiveConversation(scopeKey: string): string {
  try {
    const raw = JSON.parse(
      localStorage.getItem(storageKey(scopeKey)) || "null",
    ) as Partial<ActiveConversationSnapshot> | null;
    const conversationId = raw?.conversationId?.trim() ?? "";
    if (raw?.version !== 1 || !CONVERSATION_ID_PATTERN.test(conversationId)) {
      localStorage.removeItem(storageKey(scopeKey));
      return "main";
    }
    return conversationId;
  } catch {
    try {
      localStorage.removeItem(storageKey(scopeKey));
    } catch {
      // Storage cleanup is best-effort in restricted renderer contexts.
    }
    return "main";
  }
}

export function saveActiveConversation(
  scopeKey: string,
  conversationId: string,
): void {
  const normalized = conversationId.trim();
  if (!CONVERSATION_ID_PATTERN.test(normalized)) return;
  safeLocalStorageSet(
    storageKey(scopeKey),
    JSON.stringify({
      version: 1,
      conversationId: normalized,
    } satisfies ActiveConversationSnapshot),
  );
}
