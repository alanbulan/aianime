// Copyright (c) 2026 AI anime
import type {
  DecisionAnswer,
  ChatMessage,
  ChatSlashCommandResult,
  ChatScope,
  MessageContextState,
  StructuredSlashCommandName,
} from "@/modules/ai_assistant/domain/contracts";
import { normalizeMessage } from "@/modules/ai_assistant/domain/message";
import { apiCall } from "@/shared/api/client";
import { api } from "@/shared/api/transport";

type ChatNotificationResponse = {
  ok: boolean;
  data?: unknown;
};

type AppendNotificationResult = {
  delivered: boolean;
  message: ChatMessage | null;
};

export async function appendChatNotification(
  scope: ChatScope,
  text: string,
): Promise<AppendNotificationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { delivered: false, message: null };
  }

  try {
    const response = await api
      .post("api/v1/chat/notifications", {
        json: {
          scope,
          text: trimmed,
        },
      })
      .json<ChatNotificationResponse>();
    return {
      delivered: true,
      message: normalizeMessage(response.data, "assistant"),
    };
  } catch (error) {
    console.error("[superchat] append notification failed", error);
    return {
      delivered: false,
      message: normalizeMessage(
        {
          id: `task-notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: "assistant",
          content: trimmed,
          created_at: new Date().toISOString(),
        },
        "assistant",
      ),
    };
  }
}

export async function cancelChatBestEffort(): Promise<void> {
  try {
    await api.post("api/v1/chat/cancel");
  } catch {
    // The local turn is already inactive; cancellation is best effort.
  }
}

export async function runChatSlashCommand(
  scope: ChatScope,
  command: StructuredSlashCommandName,
): Promise<ChatSlashCommandResult> {
  return apiCall<ChatSlashCommandResult>("/chat/commands", {
    method: "post",
    json: { scope, command },
    timeout: 90_000,
  });
}

export async function resolveChatDecision(
  decisionId: string,
  answers: DecisionAnswer[],
): Promise<void> {
  const normalizedId = decisionId.trim();
  if (!normalizedId) throw new Error("decision id is required");
  await api.post(
    `api/v1/chat/decisions/${encodeURIComponent(normalizedId)}/resolve`,
    { json: { answers } },
  );
}

export async function setChatMessageContextState(
  scope: ChatScope,
  messageId: string,
  state: MessageContextState,
): Promise<void> {
  const normalizedId = messageId.trim();
  if (!normalizedId) throw new Error("message id is required");
  await api.patch(
    `api/v1/chat/messages/${encodeURIComponent(normalizedId)}/context`,
    { json: { scope, state } },
  );
}
