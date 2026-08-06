// Copyright (c) 2026 AI anime
import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import { activeTurnIsPending } from "@/modules/ai_assistant/domain/activeTurn";
import { safeLocalStorageSet } from "@/shared/storage/localStorageQuota";

const ACTIVE_TURN_PREFIX = "superchat:active-turn:";
const ACTIVE_TURN_TTL_MS = 60 * 60 * 1000;

export type ActiveTurnSnapshot = {
  turnId: string;
  startedAt: number;
};

function activeTurnKey(scopeKey: string): string {
  return `${ACTIVE_TURN_PREFIX}${scopeKey}`;
}

function loadActiveTurn(scopeKey: string): ActiveTurnSnapshot | null {
  try {
    const raw = JSON.parse(
      localStorage.getItem(activeTurnKey(scopeKey)) || "null",
    ) as Partial<ActiveTurnSnapshot> | null;
    if (!raw || typeof raw.turnId !== "string" || typeof raw.startedAt !== "number") {
      return null;
    }
    if (!raw.turnId.trim() || Date.now() - raw.startedAt > ACTIVE_TURN_TTL_MS) {
      localStorage.removeItem(activeTurnKey(scopeKey));
      return null;
    }
    return {
      turnId: raw.turnId,
      startedAt: raw.startedAt,
    };
  } catch {
    return null;
  }
}

export function saveActiveTurn(scopeKey: string, turnId: string): void {
  if (!turnId.trim()) return;
  safeLocalStorageSet(
    activeTurnKey(scopeKey),
    JSON.stringify({ turnId, startedAt: Date.now() } satisfies ActiveTurnSnapshot),
  );
}

export function clearActiveTurn(scopeKey: string, turnId?: string | null): void {
  try {
    const current = loadActiveTurn(scopeKey);
    if (turnId && current?.turnId && current.turnId !== turnId) return;
    localStorage.removeItem(activeTurnKey(scopeKey));
  } catch {
    // best-effort cleanup
  }
}

export function loadPendingActiveTurn(
  scopeKey: string,
  messages: ChatMessage[],
): ActiveTurnSnapshot | null {
  const activeTurn = loadActiveTurn(scopeKey);
  if (!activeTurn) return null;
  if (activeTurnIsPending(messages, activeTurn.turnId)) return activeTurn;
  clearActiveTurn(scopeKey, activeTurn.turnId);
  return null;
}
