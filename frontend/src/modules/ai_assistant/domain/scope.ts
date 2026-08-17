// Copyright (c) 2026 AI anime
import type { ChatScope } from "@/modules/ai_assistant/domain/contracts";

export function scopeForProject(
  project?: string,
  conversationId = "main",
): ChatScope {
  const name = project?.trim();
  const normalizedConversationId = conversationId.trim() || "main";
  if (name) {
    return {
      kind: "project",
      id: name,
      conversationId: normalizedConversationId,
    };
  }
  return {
    kind: "home",
    id: null,
    conversationId: normalizedConversationId,
  };
}

export function scopeSessionKey(scope: ChatScope): string {
  if (scope.kind === "project" && scope.id) {
    return `ai_anime:project:${scope.id}:${scope.conversationId || "main"}`;
  }
  return `ai_anime:home:${scope.conversationId || "main"}`;
}

export function scopeMatches(a: ChatScope | undefined, b: ChatScope): boolean {
  if (!a) return false;
  if (a.kind !== b.kind) return false;
  if ((a.conversationId || "main") !== (b.conversationId || "main")) {
    return false;
  }
  if (a.kind === "home") return true;
  return (a.id ?? null) === (b.id ?? null);
}

export function isChatScope(value: unknown): value is ChatScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Record<string, unknown>;
  const conversationId = scope.conversationId;
  return (
    (scope.kind === "home" || scope.kind === "project")
    && (
      conversationId === undefined
      || (typeof conversationId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(conversationId))
    )
  );
}
