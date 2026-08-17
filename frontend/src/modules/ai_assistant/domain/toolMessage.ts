// Copyright (c) 2026 AI anime
import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";

function resultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const value = result as Record<string, unknown>;
  if (typeof value.text === "string") return value.text;
  return JSON.stringify(result, null, 2);
}

function eventTimestamp(data: Record<string, unknown>): number {
  if (typeof data.timestamp === "number" && Number.isFinite(data.timestamp)) {
    return data.timestamp;
  }
  const createdAt = typeof data.created_at === "string" ? Date.parse(data.created_at) : NaN;
  return Number.isFinite(createdAt) ? createdAt : Date.now();
}

export function buildToolMessage(kind: string, payload: unknown): ChatMessage {
  const data = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
  const label =
    typeof data.name === "string"
      ? data.name
      : typeof data.message === "string"
        ? data.message
        : kind;
  const toolCallId = typeof data.tool_call_id === "string"
    ? data.tool_call_id.trim()
    : typeof data.toolCallId === "string"
      ? data.toolCallId.trim()
      : "";
  const eventId = typeof data.id === "string" || typeof data.id === "number"
    ? String(data.id)
    : "";
  const isResult = kind === "tool.result" || data.type === "tool.result";
  const toolInput = !isResult ? data.input : undefined;
  const toolOutput = isResult ? data.result : undefined;
  const toolError = isResult ? data.error : undefined;
  const toolState = isResult
    ? data.success === false || Boolean(toolError)
      ? "error"
      : "success"
    : "running";
  const body = isResult
    ? resultText(toolOutput)
    : toolInput === undefined
      ? ""
      : resultText(toolInput);
  return {
    id: toolCallId
      ? `tool-${toolCallId}`
      : eventId
        ? `tool-event-${eventId}`
        : `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "tool",
    text: body || label,
    turnId: typeof data.turn_id === "string" ? data.turn_id : undefined,
    toolCallId: toolCallId || undefined,
    toolName: label,
    toolState,
    toolInput,
    toolOutput,
    toolError,
    timestamp: eventTimestamp(data),
    raw: payload,
  };
}

export function mergeToolMessageState(
  current: ChatMessage,
  next: ChatMessage,
): ChatMessage {
  return {
    ...current,
    text: next.text,
    toolName: next.toolName ?? current.toolName,
    toolState: next.toolState,
    toolInput: next.toolInput ?? current.toolInput,
    toolOutput: next.toolOutput,
    toolError: next.toolError,
    timestamp: next.timestamp,
    raw: next.raw,
  };
}
