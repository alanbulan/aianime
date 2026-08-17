// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import {
  useChatSessionController,
  type ChatSessionPorts,
  type ChatSessionSocket,
  type ChatSessionSocketOptions,
} from "./useChatSessionController";

function createHarness(cachedMessages: ChatMessage[] = []) {
  let socketOptions: ChatSessionSocketOptions | null = null;
  const send = vi.fn<ChatSessionSocket["send"]>();
  const close = vi.fn<ChatSessionSocket["close"]>();
  const disconnect = vi.fn<ChatSessionSocket["disconnect"]>();
  const connect = vi.fn(() => {
    socketOptions?.onConnectedChange(true);
    socketOptions?.onConnectingChange(false);
  });
  const ports: ChatSessionPorts = {
    appendChatNotification: vi.fn(async () => ({
      delivered: true,
      message: null,
    })),
    cancelChatBestEffort: vi.fn(async () => undefined),
    clearActiveTurn: vi.fn(),
    createSuperChatSocketSession: vi.fn((options) => {
      socketOptions = options;
      return { close, connect, disconnect, send };
    }),
    loadCachedMessages: vi.fn(() => cachedMessages),
    loadPendingActiveTurn: vi.fn(() => null),
    loadScopedMessageIds: vi.fn(() => ({
      pinnedIds: new Set(["pinned-1"]),
      deletedIds: new Set(["deleted-1"]),
    })),
    loadSuperChatSettings: vi.fn(() => ({
      showStructuredSourceWhileStreaming: true,
      showToolEvents: false,
    })),
    pruneOldMessageCaches: vi.fn(),
    saveActiveTurn: vi.fn(),
    saveCachedMessages: vi.fn(),
    saveScopedMessageIds: vi.fn(),
    saveSuperChatSettings: vi.fn(),
  };
  return {
    close,
    connect,
    disconnect,
    getSocketOptions: () => socketOptions,
    ports,
    send,
  };
}

describe("useChatSessionController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("hydrates scoped state and connects through the injected socket port", () => {
    const cachedMessage: ChatMessage = {
      id: "cached-1",
      role: "assistant",
      text: "cached",
      timestamp: 1,
    };
    const harness = createHarness([cachedMessage]);
    const { result, unmount } = renderHook(() =>
      useChatSessionController({
        project: "project-a",
        displayName: "Alice",
        ports: harness.ports,
      }),
    );

    expect(result.current.messages).toEqual([cachedMessage]);
    expect(result.current.pinnedIds).toEqual(new Set(["pinned-1"]));
    expect(result.current.deletedIds).toEqual(new Set(["deleted-1"]));
    expect(harness.ports.pruneOldMessageCaches).toHaveBeenCalledTimes(1);
    expect(harness.getSocketOptions()?.scope).toEqual({
      kind: "project",
      id: "project-a",
      conversationId: "main",
    });

    act(() => vi.advanceTimersByTime(50));
    expect(result.current.connected).toBe(true);

    act(() => result.current.requestHistory());
    expect(harness.send).toHaveBeenCalledWith({
      type: "scope.set",
      scope: { kind: "project", id: "project-a", conversationId: "main" },
    });

    unmount();
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  });

  it("sends a local turn and aborts it through the injected command ports", () => {
    const harness = createHarness();
    const { result } = renderHook(() =>
      useChatSessionController({
        project: "project-a",
        displayName: "Alice",
        ports: harness.ports,
      }),
    );
    act(() => vi.advanceTimersByTime(50));

    let sent = false;
    act(() => {
      sent = result.current.send(
        "  visible text  ",
        [{ id: "attachment-1", fileName: "story.txt" }],
        "cloud transport text",
      );
    });

    expect(sent).toBe(true);
    expect(result.current.messages).toMatchObject([
      {
        role: "user",
        text: "visible text",
        displayName: "Alice",
        attachments: [{ id: "attachment-1", fileName: "story.txt" }],
      },
    ]);
    expect(harness.ports.saveActiveTurn).toHaveBeenCalledWith(
      "ai_anime:project:project-a:main",
      expect.stringMatching(/^turn-1000-/),
    );
    expect(harness.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "chat.message",
      scope: { kind: "project", id: "project-a", conversationId: "main" },
      text: "cloud transport text",
      attachments: [{ id: "attachment-1", fileName: "story.txt" }],
    }));

    const turnId = result.current.activeTurnId;
    act(() => result.current.abort());

    expect(harness.ports.clearActiveTurn).toHaveBeenCalledWith(
      "ai_anime:project:project-a:main",
      turnId,
    );
    expect(harness.ports.cancelChatBestEffort).toHaveBeenCalledTimes(1);
    expect(harness.close).toHaveBeenCalledWith(4000, "client abort");
    expect(result.current.activeTurnId).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("requests a history snapshot when an active turn has not finalized", () => {
    const harness = createHarness();
    const { result } = renderHook(() =>
      useChatSessionController({
        project: "project-a",
        displayName: "Alice",
        ports: harness.ports,
      }),
    );
    act(() => vi.advanceTimersByTime(50));
    act(() => {
      result.current.send("继续之前的任务");
    });
    harness.send.mockClear();

    act(() => vi.advanceTimersByTime(5_000));

    expect(harness.send).toHaveBeenCalledWith({
      type: "scope.set",
      scope: { kind: "project", id: "project-a", conversationId: "main" },
    });
  });

  it("sends conversation deletion through the active project scope", () => {
    const harness = createHarness();
    const { result } = renderHook(() =>
      useChatSessionController({
        project: "project-a",
        conversationId: "chat_2",
        displayName: "Alice",
        ports: harness.ports,
      }),
    );
    act(() => vi.advanceTimersByTime(50));

    let accepted = false;
    act(() => {
      accepted = result.current.deleteConversation("chat_2");
    });

    expect(accepted).toBe(true);
    expect(harness.send).toHaveBeenCalledWith({
      type: "conversation.delete",
      scope: {
        kind: "project",
        id: "project-a",
        conversationId: "chat_2",
      },
      conversationId: "chat_2",
    });
  });
});
