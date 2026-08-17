// Copyright (c) 2026 AI anime
import { normalizeMessage } from "@/modules/ai_assistant/domain/message";
import type {
  ChatMessage,
  ServerFrame,
} from "@/modules/ai_assistant/domain/contracts";
import {
  buildToolMessage,
  mergeToolMessageState,
} from "@/modules/ai_assistant/domain/toolMessage";
import { sortMessages } from "@/modules/ai_assistant/application/messageTimeline";

const EXECUTABLE_HIDDEN_TOOL_NAMES = new Set(["freezone_emit_canvas_command"]);

export function upsertAssistantMessage(
  messages: ChatMessage[],
  turnId: string,
  text: string,
): ChatMessage[] {
  const id = `assistant-${turnId}`;
  const existingIndex = messages.findIndex((message) => message.id === id);
  if (existingIndex >= 0) {
    return sortMessages(
      messages.map((message, index) =>
        index === existingIndex
          ? { ...message, text, timestamp: Date.now() }
          : message,
      ),
    );
  }
  return sortMessages([
    ...messages,
    {
      id,
      role: "assistant",
      text,
      turnId,
      timestamp: Date.now(),
    },
  ]);
}

export function upsertServerAssistantMessage(
  messages: ChatMessage[],
  payload: unknown,
  turnId?: string,
): ChatMessage[] {
  const nextMessage = normalizeMessage(payload, "assistant");
  if (!nextMessage) return messages;
  const normalizedTurnId = nextMessage.turnId ?? (turnId?.trim() || undefined);
  const mergedMessage = normalizedTurnId ? { ...nextMessage, turnId: normalizedTurnId } : nextMessage;
  const existingIndex = messages.findIndex((message) => message.id === mergedMessage.id);
  const withoutTransient = normalizedTurnId
    ? messages.filter(
        (message, index) =>
          index === existingIndex
          || !(message.role === "assistant" && message.turnId === normalizedTurnId),
      )
    : messages;
  if (existingIndex >= 0) {
    return sortMessages(
      withoutTransient.map(
        (message) => (message.id === mergedMessage.id ? mergedMessage : message),
      ),
    );
  }
  return sortMessages([...withoutTransient, mergedMessage]);
}

export function appendToolMessage(
  messages: ChatMessage[],
  kind: string,
  payload: unknown,
): ChatMessage[] {
  return [...messages, buildToolMessage(kind, payload)];
}

export function shouldPreserveToolMessage(payload: ServerFrame): boolean {
  const text =
    payload.type === "tool.result" && typeof payload.result === "string"
      ? payload.result
      : payload.type === "tool.result"
          && payload.result
          && typeof payload.result === "object"
          && typeof (payload.result as Record<string, unknown>).text === "string"
        ? String((payload.result as Record<string, unknown>).text)
        : "";
  return (
    (payload.type === "tool.result" || payload.type === "tool.call")
    && (
      (typeof payload.name === "string" && EXECUTABLE_HIDDEN_TOOL_NAMES.has(payload.name))
      || text.includes("canvas_chat_commands.v1")
      || text.includes("canvas_command_emitted")
    )
  );
}

export function upsertToolMessage(
  messages: ChatMessage[],
  kind: string,
  payload: unknown,
): ChatMessage[] {
  const nextMessage = buildToolMessage(kind, payload);
  const existingByCallId = nextMessage.toolCallId
    ? messages.findIndex(
        (message) => message.role === "tool" && message.toolCallId === nextMessage.toolCallId,
      )
    : -1;
  if (existingByCallId >= 0) {
    return sortMessages(
      messages.map((message, index) =>
        index === existingByCallId
          ? mergeToolMessageState(message, nextMessage)
          : message,
      ),
    );
  }
  return sortMessages([...messages, nextMessage]);
}
