// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  projectPanelMessages,
  type ChatMessage,
} from "@/modules/ai_assistant/public";

function message(
  id: string,
  role: ChatMessage["role"],
  text: string,
  turnId?: string,
  raw?: unknown,
): ChatMessage {
  return { id, role, text, turnId, raw, timestamp: 1 };
}

function project(overrides: Record<string, unknown> = {}) {
  return projectPanelMessages({
    activeTurnId: null,
    busy: false,
    composerWaiting: false,
    deletedIds: new Set<string>(),
    messages: [],
    pinnedIds: new Set<string>(),
    search: "",
    showStructuredSourceWhileStreaming: false,
    showToolEvents: false,
    streamText: "",
    ...overrides,
  });
}

describe("AI Assistant panel message projection", () => {
  it("keeps excluded messages visible but removes them from context projections", () => {
    const messages = [
      message("user", "user", " First prompt "),
      message("tool", "tool", "tool output"),
      message("trace", "assistant", "trace output", undefined, { role: "trace" }),
      message("assistant", "assistant", "Final REPLY"),
      message("deleted", "user", "Deleted prompt"),
    ];

    const result = project({
      deletedIds: new Set(["deleted"]),
      messages,
      pinnedIds: new Set(["assistant", "deleted"]),
      search: " reply ",
    });

    expect(result.activeMessages.map((item) => item.id)).toEqual([
      "user",
      "assistant",
      "deleted",
    ]);
    expect(result.userMessageHistory).toEqual([" First prompt "]);
    expect(result.pinnedMessages.map((item) => item.id)).toEqual(["assistant"]);
    expect(result.visibleMessages.map((item) => item.id)).toEqual(["assistant"]);
    expect(result.activeMessageCount).toBe(3);
    expect(result.lastActiveMessageId).toBe("deleted");
    expect(messages).toHaveLength(5);
  });

  it("retains tool envelopes when enabled and reuses the active list without search", () => {
    const result = project({
      messages: [
        message("tool", "tool", "tool output"),
        message("trace", "assistant", "trace output", undefined, { role: "trace" }),
      ],
      showToolEvents: true,
    });

    expect(result.activeMessages.map((item) => item.id)).toEqual([
      "tool",
      "trace",
    ]);
    expect(result.visibleMessages).toBe(result.activeMessages);
  });

  it("projects current and visible streaming assistant state", () => {
    const messages = [
      message("user", "user", "Prompt", "turn-1"),
      message("assistant", "assistant", "Partial", "turn-1"),
    ];
    const deferred = project({
      busy: true,
      messages,
      streamText: "Partial",
    });

    expect(deferred.deferStructuredRender).toBe(true);
    expect(deferred.currentStreamingAssistantId).toBe("assistant");
    expect(deferred.streamingAssistantId).toBe("assistant");
    expect(deferred.streamTextAlreadyRendered).toBe(true);

    const sourceVisible = project({
      busy: true,
      messages,
      search: "missing",
      showStructuredSourceWhileStreaming: true,
      streamText: "Partial",
    });
    expect(sourceVisible.deferStructuredRender).toBe(false);
    expect(sourceVisible.currentStreamingAssistantId).toBeNull();
    expect(sourceVisible.streamingAssistantId).toBe("assistant");
    expect(sourceVisible.streamTextAlreadyRendered).toBe(false);
  });

  it("waits for the active turn until a non-empty assistant reply arrives", () => {
    const user = message("user", "user", "Prompt", "turn-1");
    expect(project({ activeTurnId: "turn-1", busy: true, messages: [user] }).showWaitingIndicator).toBe(true);
    expect(
      project({
        activeTurnId: "turn-1",
        busy: true,
        messages: [user, message("blank", "assistant", "", "turn-1")],
      }).showWaitingIndicator,
    ).toBe(true);
    expect(
      project({
        activeTurnId: "turn-1",
        busy: true,
        messages: [user, message("reply", "assistant", "Done", "turn-1")],
      }).showWaitingIndicator,
    ).toBe(false);
  });

  it("uses the latest user turn fallback and composer waiting override", () => {
    const messages = [
      message("user", "user", "Prompt", "turn-1"),
      message("reply", "assistant", "Done", "turn-1"),
    ];

    expect(project({ busy: true }).showWaitingIndicator).toBe(true);
    expect(project({ busy: true, messages }).showWaitingIndicator).toBe(false);
    expect(
      project({ busy: true, composerWaiting: true, messages }).showWaitingIndicator,
    ).toBe(true);
    expect(
      project({
        busy: true,
        composerWaiting: true,
        messages,
        streamText: "Streaming",
      }).showWaitingIndicator,
    ).toBe(false);
  });
});
