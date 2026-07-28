// Copyright (c) 2026 AI anime
import { normalizeMessage } from "@/features/superchat/message";
import type { ChatMessage, ChatScope } from "@/features/superchat/types";
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
