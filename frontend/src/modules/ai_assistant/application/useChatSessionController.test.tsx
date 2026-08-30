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
    loadChatModels: vi.fn(async () => ([
      { id: "auto", label: "自动（遵循模型优先级）", source: "auto" as const },
      {
        id: "cloud:text-model",
        label: "Qwen3.8-27B",
        source: "cloud" as const,
        reasoningEfforts: ["low", "medium", "xhigh"],
        defaultReasoningEffort: "low",
      },
    ])),
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
    resolveChatDecision: vi.fn(async () => undefined),
    runChatSlashCommand: vi.fn(async (_scope, command) => ({
      command,
      text: "命令执行完成",
    })),
    saveActiveTurn: vi.fn(),
    saveCachedMessages: vi.fn(),
    saveScopedMessageIds: vi.fn(),
    saveSuperChatSettings: vi.fn(),
    setChatMessageContextState: vi.fn(async () => undefined),
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
    vi.mocked(harness.ports.loadSuperChatSettings).mockReturnValue({
      showStructuredSourceWhileStreaming: true,
      showToolEvents: true,
    });
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
    act(() => harness.getSocketOptions()?.onFrame({
      type: "tool.result",
      name: "ai_anime_wait_task",
      turn_id: turnId ?? undefined,
      tool_call_id: "wait-1",
      success: true,
      result: { timed_out: true },
    }));
    expect(result.current.messages.find((item) => item.toolCallId === "wait-1")).toMatchObject({
      toolState: "pending",
    });

    act(() => result.current.abort());

    expect(harness.ports.clearActiveTurn).toHaveBeenCalledWith(
      "ai_anime:project:project-a:main",
      turnId,
    );
    expect(harness.ports.cancelChatBestEffort).toHaveBeenCalledTimes(1);
    expect(harness.close).toHaveBeenCalledWith(4000, "client abort");
    expect(result.current.activeTurnId).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(result.current.messages.find((item) => item.toolCallId === "wait-1")).toMatchObject({
      toolState: "error",
      toolError: "本轮已取消，当前没有任务在执行",
    });
  });

  it("runs a structured command out of band without creating chat messages", async () => {
    const harness = createHarness();
    const { result } = renderHook(() =>
      useChatSessionController({
        project: "project-a",
        displayName: "Alice",
        ports: harness.ports,
      }),
    );
    act(() => vi.advanceTimersByTime(50));

    await expect(result.current.runSlashCommand("context")).resolves.toEqual({
      command: "context",
      text: "命令执行完成",
    });

    expect(harness.ports.runChatSlashCommand).toHaveBeenCalledWith(
      { kind: "project", id: "project-a", conversationId: "main" },
      "context",
    );
    expect(result.current.messages).toEqual([]);
    expect(harness.send).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "chat.message",
    }));
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

  it("loads models and sends a conversation-only model selection frame", async () => {
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
    await act(async () => Promise.resolve());
    expect(harness.ports.loadChatModels).toHaveBeenCalledTimes(1);
    expect(harness.send).toHaveBeenCalledWith({
      type: "session.model.get",
      scope: {
        kind: "project",
        id: "project-a",
        conversationId: "chat_2",
      },
    });

    harness.send.mockClear();
    let accepted = false;
    act(() => {
      accepted = result.current.switchModel("cloud:text-model");
    });

    expect(accepted).toBe(true);
    expect(harness.send).toHaveBeenCalledWith({
      type: "session.model.set",
      scope: {
        kind: "project",
        id: "project-a",
        conversationId: "chat_2",
      },
      selector: "cloud:text-model",
      reasoning_effort: "low",
    });

    act(() => harness.getSocketOptions()?.onFrame({
      type: "session.model.state",
      scope: {
        kind: "project",
        id: "project-a",
        conversationId: "chat_2",
      },
      selector: "cloud:text-model",
      reasoning_effort: "low",
    }));
    harness.send.mockClear();
    act(() => {
      accepted = result.current.switchReasoningEffort("xhigh");
    });
    expect(accepted).toBe(true);
    expect(harness.send).toHaveBeenCalledWith({
      type: "session.model.set",
      scope: {
        kind: "project",
        id: "project-a",
        conversationId: "chat_2",
      },
      selector: "cloud:text-model",
      reasoning_effort: "xhigh",
    });
  });

  it("submits a live decision and removes it only after the HTTP answer succeeds", async () => {
    const harness = createHarness();
    const { result } = renderHook(() =>
      useChatSessionController({
        project: "project-a",
        displayName: "Alice",
        ports: harness.ports,
      }),
    );
    act(() => vi.advanceTimersByTime(50));

    act(() => harness.getSocketOptions()?.onFrame({
      type: "decision_required",
      scope: { kind: "project", id: "project-a" },
      decision: {
        id: "decision-1",
        title: "生成前确认",
        source: "question",
        status: "pending",
        questions: [
          {
            id: "resolution",
            header: "分辨率",
            question: "请选择分辨率",
            options: [
              { id: "1080p", label: "1080p", description: "高清" },
              { id: "720p", label: "720p", description: "均衡" },
            ],
          },
        ],
      },
    }));

    expect(result.current.decisions).toHaveLength(1);
    await act(async () => {
      await result.current.resolveDecision(
        result.current.decisions[0]!,
        [{ question_id: "resolution", option_id: "1080p" }],
      );
    });

    expect(harness.ports.resolveChatDecision).toHaveBeenCalledWith(
      "decision-1",
      [{ question_id: "resolution", option_id: "1080p" }],
    );
    expect(result.current.decisions).toEqual([]);
    expect(result.current.submittingDecisionIds.size).toBe(0);
  });

  it("persists the new scope's messages after a switch without leaking the old scope", () => {
    const messagesA: ChatMessage[] = [
      { id: "a-1", role: "assistant", text: "A", timestamp: 1 },
    ];
    const messagesB: ChatMessage[] = [
      { id: "b-1", role: "assistant", text: "B", timestamp: 1 },
    ];
    const harness = createHarness(messagesA);
    vi.mocked(harness.ports.loadCachedMessages).mockImplementation(
      (scopeKey: string) =>
        scopeKey.endsWith("project-b:main") ? messagesB : messagesA,
    );

    const { result, rerender } = renderHook(
      ({ project }: { project: string }) =>
        useChatSessionController({
          project,
          displayName: "Alice",
          ports: harness.ports,
        }),
      { initialProps: { project: "project-a" } },
    );
    act(() => vi.advanceTimersByTime(50));
    expect(result.current.messages).toEqual(messagesA);

    rerender({ project: "project-b" });
    act(() => vi.advanceTimersByTime(50));
    expect(result.current.messages).toEqual(messagesB);

    // An update landing after the reseed must still be persisted under the
    // new scope key (the guard must not wedge after the switch).
    act(() => {
      result.current.send("hello after switch");
    });
    act(() => vi.advanceTimersByTime(300));

    const savedForNewScope = vi
      .mocked(harness.ports.saveCachedMessages)
      .mock.calls.filter(
        ([scopeKey]) => scopeKey === "ai_anime:project:project-b:main",
      );
    expect(savedForNewScope.length).toBeGreaterThan(0);
    for (const [, persisted] of savedForNewScope) {
      expect(persisted).not.toEqual(messagesA);
    }
    expect(savedForNewScope[savedForNewScope.length - 1]?.[1]).toMatchObject([
      { id: "b-1", text: "B" },
      { role: "user", text: "hello after switch" },
    ]);
  });
});
