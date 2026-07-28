// Copyright (c) 2026 AI anime
import { normalizeMessage } from "@/features/superchat/message";
import { sortMessages } from "@/features/superchat/message-timeline";
import type { ChatMessage, ServerFrame } from "@/features/superchat/types";

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

function resultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const value = result as Record<string, unknown>;
  if (typeof value.text === "string") return value.text;
  return JSON.stringify(result, null, 2);
}

function buildToolMessage(kind: string, payload: unknown): ChatMessage {
  const data = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
  const label =
    typeof data.name === "string"
      ? data.name
      : typeof data.message === "string"
        ? data.message
        : kind;
  const body = "result" in data ? resultText(data.result) : JSON.stringify(payload, null, 2);
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "tool",
    text: body ? `${label}\n\n${body}` : label,
    turnId: typeof data.turn_id === "string" ? data.turn_id : undefined,
    timestamp: Date.now(),
    raw: payload,
  };
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
  if (!nextMessage.turnId) return sortMessages([...messages, nextMessage]);

  const existingIndex = messages.findIndex(
    (message) => message.role === "tool" && message.turnId === nextMessage.turnId,
  );
  if (existingIndex < 0) return sortMessages([...messages, nextMessage]);

  return sortMessages(
    messages.map((message, index) =>
      index === existingIndex
        ? {
          ...message,
          text: nextMessage.text,
          timestamp: nextMessage.timestamp,
          raw: nextMessage.raw,
        }
        : message,
    ),
  );
}
