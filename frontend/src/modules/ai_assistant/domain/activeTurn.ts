// Copyright (c) 2026 AI anime
import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import { hasStructuredContent } from "@/modules/ai_assistant/domain/structuredContent";

export function activeTurnIsPending(
  messages: ChatMessage[],
  turnId: string | null | undefined,
): boolean {
  if (!turnId) return false;
  const hasUserMessage = messages.some(
    (message) => message.role === "user" && message.turnId === turnId,
  );
  if (!hasUserMessage) return false;

  return !messages.some(
    (message) =>
      message.role === "assistant"
      && message.turnId === turnId
      && (message.text.trim().length > 0 || hasStructuredContent(message.raw)),
  );
}

export function currentTurnIsLive(
  turnId: string | null | undefined,
  messages: ChatMessage[],
): boolean {
  if (!turnId) return false;
  return activeTurnIsPending(messages, turnId);
}
