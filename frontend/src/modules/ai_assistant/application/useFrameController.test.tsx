// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useSuperChatFrameController,
  type ChatMessage,
} from "@/modules/ai_assistant/public";

type ControllerOptions = Parameters<typeof useSuperChatFrameController>[0];

function message(
  id: string,
  role: ChatMessage["role"],
  text: string,
  timestamp: number,
  turnId?: string,
): ChatMessage {
  return { id, role, text, timestamp, turnId };
}

function createOptions(overrides: Partial<ControllerOptions> = {}): ControllerOptions {
  return {
    desiredScope: { kind: "project", id: "project-a" },
    showToolEvents: false,
    messagesRef: { current: [] },
    activeTurnIdRef: { current: null },
    pendingClientTurnIdRef: { current: null },
    recentlyCompletedTurnIdRef: { current: null },
    cancelledTurnIdsRef: { current: new Set() },
    streamTextRef: { current: "" },
    setConnected: vi.fn(),
    setConnecting: vi.fn(),
    setError: vi.fn(),
    setHistoryReady: vi.fn(),
    setConversations: vi.fn(),
    setMessages: vi.fn(),
    setBusy: vi.fn(),
    setStreamText: vi.fn(),
    markTurnActive: vi.fn(),
    markTurnInactive: vi.fn(),
    finalizeStream: vi.fn(),
    ...overrides,
  };
}

function callsOf(setter: unknown): unknown[][] {
  return (setter as { mock: { calls: unknown[][] } }).mock.calls;
}

function applyLastMessageUpdate(
  options: ControllerOptions,
  current: ChatMessage[],
): ChatMessage[] {
  const calls = callsOf(options.setMessages);
  const action = calls[calls.length - 1]?.[0] as
    | ChatMessage[]
    | ((value: ChatMessage[]) => ChatMessage[]);
  return typeof action === "function" ? action(current) : action;
}

describe("useSuperChatFrameController", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a matching scope snapshot and projects normalized history", () => {
    const options = createOptions();
    const { result } = renderHook(() => useSuperChatFrameController(options));

    act(() => result.current({
      type: "scope.changed",
      scope: { kind: "project", id: "project-a" },
      history: [
        { id: "user-1", role: "user", content: "开始", timestamp: 10 },
        { id: "assistant-1", role: "assistant", content: "完成", timestamp: 20 },
      ],
      busy: false,
    }));

    expect(options.setConnected).toHaveBeenCalledWith(true);
    expect(options.setConnecting).toHaveBeenCalledWith(false);
    expect(options.setError).toHaveBeenCalledWith(null);
    expect(options.setHistoryReady).toHaveBeenCalledWith(true);
    expect(applyLastMessageUpdate(options, [])).toMatchObject([
      { id: "user-1", role: "user", text: "开始" },
      { id: "assistant-1", role: "assistant", text: "完成" },
    ]);
    expect(options.setBusy).toHaveBeenLastCalledWith(false);
  });

  it("updates connection state but ignores a snapshot for another scope", () => {
    const options = createOptions();
    const { result } = renderHook(() => useSuperChatFrameController(options));

    act(() => result.current({
      type: "scope.changed",
      scope: { kind: "project", id: "project-b" },
      history: [],
    }));

    expect(options.setConnected).toHaveBeenCalledWith(true);
    expect(options.setConnecting).toHaveBeenCalledWith(false);
    expect(options.setHistoryReady).not.toHaveBeenCalled();
    expect(options.setMessages).not.toHaveBeenCalled();
  });

  it("clears active conversation state after the server confirms deletion", () => {
    const options = createOptions({
      desiredScope: {
        kind: "project",
        id: "project-a",
        conversationId: "chat_2",
      },
      messagesRef: {
        current: [message("assistant-1", "assistant", "旧消息", 10)],
      },
      streamTextRef: { current: "流式内容" },
    });
    const { result } = renderHook(() => useSuperChatFrameController(options));

    act(() => result.current({
      type: "conversation.deleted",
      conversationId: "chat_2",
      conversations: [
        {
          id: "main",
          title: "新会话",
          updatedAt: "2026-08-14T12:00:00+08:00",
          messageCount: 0,
        },
      ],
    }));

    expect(options.setConversations).toHaveBeenCalledWith([
      expect.objectContaining({ id: "main", title: "新会话" }),
    ]);
    expect(options.setMessages).toHaveBeenCalledWith([]);
    expect(options.setStreamText).toHaveBeenCalledWith("");
    expect(options.setHistoryReady).toHaveBeenCalledWith(true);
    expect(options.setBusy).toHaveBeenCalledWith(false);
  });

  it("accumulates assistant deltas under the pending client turn", () => {
    const options = createOptions({
      pendingClientTurnIdRef: { current: "turn-pending" },
    });
    const { result } = renderHook(() => useSuperChatFrameController(options));

    act(() => result.current({
      type: "assistant.delta",
      text: "第一段",
      turn_id: "turn-server",
      accumulated: false,
    }));
    const first = applyLastMessageUpdate(options, []);
    act(() => result.current({
      type: "assistant.delta",
      text: "第二段",
      turn_id: "turn-server",
      accumulated: false,
    }));
    const second = applyLastMessageUpdate(options, first);

    expect(options.markTurnActive).toHaveBeenLastCalledWith("turn-pending");
    expect(second).toContainEqual(expect.objectContaining({
      id: "assistant-turn-pending",
      text: "第一段第二段",
      turnId: "turn-pending",
    }));
    expect(options.setStreamText).toHaveBeenLastCalledWith("");
  });

  it("ends the active turn as soon as the persisted assistant message arrives", () => {
    const recentlyCompleted = { current: null as string | null };
    const markTurnInactive = vi.fn((turnId?: string | null) => {
      recentlyCompleted.current = turnId ?? null;
    });
    const options = createOptions({
      activeTurnIdRef: { current: "turn-1" },
      recentlyCompletedTurnIdRef: recentlyCompleted,
      markTurnInactive,
    });
    const { result } = renderHook(() => useSuperChatFrameController(options));

    act(() => result.current({
      type: "assistant.message",
      turn_id: "turn-1",
      message: {
        id: "assistant-1",
        role: "assistant",
        content: "已经完成",
        turn_id: "turn-1",
        created_at: "2026-08-11T19:23:14+08:00",
      },
    }));

    expect(markTurnInactive).toHaveBeenCalledWith("turn-1");
    expect(applyLastMessageUpdate(options, [])).toContainEqual(expect.objectContaining({
      id: "assistant-1",
      text: "已经完成",
      turnId: "turn-1",
    }));

    act(() => result.current({ type: "chat.done", turn_id: "turn-1" }));
    expect(options.finalizeStream).not.toHaveBeenCalled();
  });

  it("reconciles a persisted completed turn even while the busy flag is stale", () => {
    const current = [message("local-user", "user", "继续", 100, "turn-1")];
    const options = createOptions({
      messagesRef: { current },
      activeTurnIdRef: { current: "turn-1" },
    });
    const { result } = renderHook(() => useSuperChatFrameController(options));

    act(() => result.current({
      type: "scope.changed",
      scope: { kind: "project", id: "project-a" },
      history: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "已经完成",
          turn_id: "turn-1",
          created_at: "2026-08-11T19:23:14+08:00",
        },
      ],
      busy: true,
    }));

    expect(options.markTurnInactive).toHaveBeenCalledWith("turn-1");
  });

  it("ignores cancelled deltas and clears cancellation only on done", () => {
    const cancelled = new Set(["turn-1"]);
    const options = createOptions({
      cancelledTurnIdsRef: { current: cancelled },
    });
    const { result } = renderHook(() => useSuperChatFrameController(options));

    act(() => result.current({
      type: "assistant.delta",
      text: "不应显示",
      turn_id: "turn-1",
    }));
    expect(options.setMessages).not.toHaveBeenCalled();

    act(() => result.current({ type: "chat.done", turn_id: "turn-1" }));
    expect(cancelled.has("turn-1")).toBe(false);
    expect(options.markTurnInactive).toHaveBeenCalledWith("turn-1");
    expect(options.finalizeStream).not.toHaveBeenCalled();

    act(() => result.current({ type: "chat.done", turn_id: "turn-2" }));
    expect(options.finalizeStream).toHaveBeenCalledTimes(1);
  });

  it("hides ordinary tool calls but preserves executable Canvas commands", () => {
    const options = createOptions({ showToolEvents: false });
    const { result } = renderHook(() => useSuperChatFrameController(options));

    act(() => result.current({
      type: "tool.call",
      name: "search",
      turn_id: "turn-1",
    }));
    expect(options.setMessages).not.toHaveBeenCalled();

    act(() => result.current({
      type: "tool.call",
      name: "freezone_emit_canvas_command",
      turn_id: "turn-1",
    }));
    expect(options.setMessages).toHaveBeenCalledTimes(1);
    expect(applyLastMessageUpdate(options, [
      message("user-1", "user", "开始", 10, "turn-1"),
    ])).toContainEqual(expect.objectContaining({
      role: "tool",
      turnId: "turn-1",
    }));
  });

  it("uses pending turn precedence for busy and thread frames", () => {
    const recent = { current: "turn-old" as string | null };
    const active = { current: null as string | null };
    const options = createOptions({
      activeTurnIdRef: active,
      pendingClientTurnIdRef: { current: "turn-pending" },
      recentlyCompletedTurnIdRef: recent,
    });
    const { result } = renderHook(() => useSuperChatFrameController(options));

    act(() => result.current({
      type: "chat.busy",
      turn_id: "turn-server",
      message: "处理中",
    }));
    expect(options.setError).toHaveBeenCalledWith("处理中");
    expect(options.markTurnActive).toHaveBeenLastCalledWith("turn-pending");

    act(() => result.current({
      type: "thread.started",
      turn_id: "turn-server",
    }));
    expect(active.current).toBe("turn-pending");
    expect(recent.current).toBeNull();
  });

  it("keeps conflict errors busy but ends the turn for ordinary errors", () => {
    const options = createOptions({
      activeTurnIdRef: { current: "turn-1" },
    });
    const { result } = renderHook(() => useSuperChatFrameController(options));

    act(() => result.current({
      type: "error",
      message: "当前用户已有 AI 对话正在处理中，请稍后重试",
    }));
    expect(options.setBusy).toHaveBeenLastCalledWith(true);
    expect(options.markTurnInactive).not.toHaveBeenCalled();

    act(() => result.current({ type: "error", message: "普通错误" }));
    expect(options.markTurnInactive).toHaveBeenCalledWith("turn-1");
    expect(options.setConnecting).toHaveBeenLastCalledWith(false);
  });
});
