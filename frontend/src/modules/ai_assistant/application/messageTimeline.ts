// Copyright (c) 2026 AI anime
import { normalizeMessage } from "@/modules/ai_assistant/domain/message";
import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import {
  buildToolMessage,
  mergeToolMessageState,
  settleRunningToolMessages,
} from "@/modules/ai_assistant/domain/toolMessage";

function historyEntryMessages(source: unknown): ChatMessage[] {
  const message = normalizeMessage(source);
  if (!message) return [];
  if (!source || typeof source !== "object") return [message];
  const uiEvents = (source as Record<string, unknown>).ui_events;
  if (!Array.isArray(uiEvents) || uiEvents.length === 0) return [message];

  const toolMessages: ChatMessage[] = [];
  for (const event of uiEvents) {
    if (!event || typeof event !== "object") continue;
    const kind = String((event as Record<string, unknown>).type || "");
    if (kind !== "tool.call" && kind !== "tool.result") continue;
    const next = buildToolMessage(kind, event);
    const existingIndex = next.toolCallId
      ? toolMessages.findIndex((item) => item.toolCallId === next.toolCallId)
      : -1;
    if (existingIndex >= 0) {
      toolMessages[existingIndex] = mergeToolMessageState(
        toolMessages[existingIndex],
        next,
      );
    } else {
      toolMessages.push(next);
    }
  }

  return message.role === "assistant" && message.turnId
    ? [
        ...settleRunningToolMessages(toolMessages, message.turnId),
        message,
      ]
    : [message, ...toolMessages];
}

export function normalizeHistory(messages: unknown[]): ChatMessage[] {
  return messages.flatMap(historyEntryMessages);
}

function normalizedText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function messageSignature(message: ChatMessage): string {
  return `${message.role}:${normalizedText(message.text)}`;
}

function assistantTextEquivalent(left: string, right: string): boolean {
  const leftText = normalizedText(left);
  const rightText = normalizedText(right);
  if (!leftText || !rightText) return false;
  return leftText === rightText || leftText.startsWith(rightText) || rightText.startsWith(leftText);
}

function hasEquivalentTextMessage(message: ChatMessage, history: ChatMessage[]): boolean {
  if (message.role !== "assistant") {
    const signature = messageSignature(message);
    return history.some((entry) => {
      if (messageSignature(entry) !== signature) return false;
      if (message.turnId && entry.turnId && message.turnId !== entry.turnId) return false;
      if (message.turnId && !entry.turnId && entry.timestamp < message.timestamp) return false;
      return true;
    });
  }
  return history.some(
    (entry) => {
      if (entry.role !== "assistant") return false;
      if (message.turnId && entry.turnId && message.turnId !== entry.turnId) return false;
      if (message.turnId && !entry.turnId && entry.timestamp < message.timestamp) return false;
      return assistantTextEquivalent(message.text, entry.text);
    },
  );
}

function messageSortRank(message: ChatMessage): number {
  if (message.role === "user") return 0;
  if (message.role === "tool") return 1;
  if (message.role === "assistant") return 2;
  return 3;
}

export function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((left, right) => {
    if (left.turnId && right.turnId && left.turnId === right.turnId) {
      const rank = messageSortRank(left) - messageSortRank(right);
      if (rank !== 0) return rank;
    }
    return left.timestamp - right.timestamp;
  });
}

function hasSameTurnMessage(message: ChatMessage, history: ChatMessage[]): boolean {
  if (!message.turnId) return false;
  return history.some((entry) => {
    if (entry.role !== message.role || entry.turnId !== message.turnId) return false;
    if (message.role !== "tool") return true;
    if (message.toolCallId) return entry.toolCallId === message.toolCallId;
    return entry.id === message.id;
  });
}

function hasEquivalentHistoryMessage(
  message: ChatMessage,
  history: ChatMessage[],
): boolean {
  if (history.some((entry) => entry.id === message.id)) return true;
  if (hasSameTurnMessage(message, history)) return true;
  return hasEquivalentTextMessage(message, history);
}

function hasCompletedTurnInHistory(
  message: ChatMessage,
  history: ChatMessage[],
): boolean {
  if (!message.turnId) return false;
  return turnCompletedInHistory(message.turnId, history);
}

export function turnCompletedInHistory(
  turnId: string,
  history: ChatMessage[],
): boolean {
  return history.some(
    (entry) =>
      entry.role === "assistant"
      && entry.turnId === turnId,
  );
}

export function mergeHistorySnapshot(
  current: ChatMessage[],
  history: ChatMessage[],
  protectedTurnId: string | null = null,
  preserveTransient = false,
): ChatMessage[] {
  if (current.length === 0) return history;
  if (history.length === 0) return current;
  if (!protectedTurnId && !preserveTransient) {
    return history;
  }

  const preserved = current.filter((message) => {
    const isProtectedTurn = Boolean(protectedTurnId && message.turnId === protectedTurnId);
    if (protectedTurnId && !isProtectedTurn) return false;
    if (message.role === "tool") {
      if (!preserveTransient && !isProtectedTurn) return false;
      return !hasEquivalentHistoryMessage(message, history);
    }
    if (hasCompletedTurnInHistory(message, history)) return false;
    return !hasEquivalentHistoryMessage(message, history);
  });

  const protectedLocalUser = protectedTurnId
    ? current.find((entry) => entry.turnId === protectedTurnId && entry.role === "user")
    : null;
  const protectedBackendUser = protectedLocalUser
    ? history.find(
      (entry) =>
        entry.role === "user"
        && normalizedText(entry.text) === normalizedText(protectedLocalUser.text)
        && entry.timestamp >= protectedLocalUser.timestamp,
    )
    : null;
  const protectedBackendAssistant = protectedBackendUser
    ? history.find(
      (entry) =>
        entry.role === "assistant"
        && entry.timestamp >= protectedBackendUser.timestamp,
    )
    : null;
  const protectedToolCount = preserved.filter((message) => message.role === "tool").length;
  let protectedToolIndex = 0;
  const stablePreserved = preserved.map((message) => {
    if (message.role !== "tool" || !protectedBackendUser) return message;
    protectedToolIndex += 1;
    const end = protectedBackendAssistant?.timestamp
      ?? protectedBackendUser.timestamp + protectedToolCount + 1;
    const gap = Math.max(0.001, end - protectedBackendUser.timestamp);
    return {
      ...message,
      timestamp:
        protectedBackendUser.timestamp
        + (gap * protectedToolIndex) / (protectedToolCount + 1),
    };
  });

  return sortMessages([...history, ...stablePreserved]);
}
