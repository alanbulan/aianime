// Copyright (c) 2026 AI anime
import type { ChatScope } from "@/features/superchat/types";

export function scopeForProject(project?: string): ChatScope {
  const name = project?.trim();
  if (name) return { kind: "project", id: name };
  return { kind: "home", id: null };
}

export function scopeSessionKey(scope: ChatScope): string {
  if (scope.kind === "project" && scope.id) {
    return `ai_anime:project:${scope.id}:main`;
  }
  return "ai_anime:home:main";
}

export function scopeMatches(a: ChatScope | undefined, b: ChatScope): boolean {
  if (!a) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "home") return true;
  return (a.id ?? null) === (b.id ?? null);
}

export function isChatScope(value: unknown): value is ChatScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Record<string, unknown>;
  return (
    scope.kind === "home"
    || scope.kind === "project"
    || scope.kind === "asset"
    || scope.kind === "task"
  );
}
