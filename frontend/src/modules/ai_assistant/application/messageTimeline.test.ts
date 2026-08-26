// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";
import {
  mergeHistorySnapshot,
  normalizeHistory,
  sortMessages,
  turnCompletedInHistory,
  type ChatMessage,
  type ChatRole,
} from "@/modules/ai_assistant/public";

function message(
  id: string,
  role: ChatRole,
  text: string,
  timestamp: number,
  turnId?: string,
): ChatMessage {
  return { id, role, text, timestamp, turnId };
}

describe("AI Assistant message timeline primitives", () => {
  it("normalizes valid backend history and drops empty entries", () => {
    const history = normalizeHistory([
      {
        id: "assistant-1",
        role: "assistant",
        content: "已完成",
        created_at: "2026-06-03T09:00:00Z",
      },
      null,
      { id: "empty", role: "assistant", content: "" },
    ]);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      text: "已完成",
    });
  });

  it("restores persisted tool calls before the matching assistant reply", () => {
    const history = normalizeHistory([
      {
        id: "assistant-1",
        role: "assistant",
        content: "整集已完成",
        turn_id: "turn-1",
        created_at: "2026-06-03T09:00:03Z",
        ui_events: [
          {
            id: 1,
            type: "tool.call",
            turn_id: "turn-1",
            tool_call_id: "call-1",
            name: "ai_anime_pipeline_status",
            input: { episode: 1 },
            created_at: "2026-06-03T09:00:01Z",
          },
          {
            id: 2,
            type: "tool.result",
            turn_id: "turn-1",
            tool_call_id: "call-1",
            name: "ai_anime_pipeline_status",
            success: true,
            result: { ok: true },
            created_at: "2026-06-03T09:00:02Z",
          },
        ],
      },
    ]);

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      id: "tool-call-1",
      role: "tool",
      toolName: "ai_anime_pipeline_status",
      toolState: "success",
      toolInput: { episode: 1 },
      toolOutput: { ok: true },
    });
    expect(history[1]).toMatchObject({
      id: "assistant-1",
      role: "assistant",
    });
  });

  it("restores orphaned persisted tool calls as terminal failures", () => {
    const history = normalizeHistory([
      {
        id: "assistant-1",
        role: "assistant",
        content: "任务执行失败：当前状态为 failed。",
        turn_id: "turn-1",
        created_at: "2026-06-03T09:00:03Z",
        ui_events: [
          {
            id: 1,
            type: "tool.call",
            turn_id: "turn-1",
            tool_call_id: "call-1",
            name: "ai_anime_generate_portrait",
            input: { name: "白石夏音" },
            created_at: "2026-06-03T09:00:01Z",
          },
        ],
      },
    ]);

    expect(history[0]).toMatchObject({
      toolCallId: "call-1",
      toolState: "error",
      toolError: "未执行：本轮已结束，工具未返回结果",
    });
  });

  it("keeps an in-flight tool running when it is attached to an unscoped notification", () => {
    const history = normalizeHistory([
      {
        id: "notification-1",
        role: "assistant",
        content: "角色肖像已完成",
        created_at: "2026-06-03T09:00:03Z",
        ui_events: [
          {
            id: 1,
            type: "tool.call",
            turn_id: "turn-1",
            tool_call_id: "call-1",
            name: "ai_anime_wait_task",
            created_at: "2026-06-03T09:00:01Z",
          },
        ],
      },
    ]);

    expect(history.find((item) => item.toolCallId === "call-1")).toMatchObject({
      toolState: "running",
      toolError: undefined,
    });
  });

  it("sorts messages in one turn as user, tool, assistant without mutating input", () => {
    const messages = [
      message("assistant-1", "assistant", "完成", 1, "turn-1"),
      message("user-1", "user", "开始", 3, "turn-1"),
      message("tool-1", "tool", "执行", 2, "turn-1"),
    ];

    const sorted = sortMessages(messages);

    expect(sorted.map((item) => item.id)).toEqual(["user-1", "tool-1", "assistant-1"]);
    expect(messages.map((item) => item.id)).toEqual(["assistant-1", "user-1", "tool-1"]);
  });

  it("does not treat an unscoped task notification as the active turn's completion", () => {
    const notificationHistory = [
      message("backend-user", "user", "开始生成", 110, "turn-1"),
      message("task-notification", "assistant", "角色肖像已完成", 120),
    ];

    expect(turnCompletedInHistory("turn-1", notificationHistory)).toBe(false);
    expect(turnCompletedInHistory("turn-1", [
      ...notificationHistory,
      message("backend-assistant", "assistant", "本轮完成", 130, "turn-1"),
    ])).toBe(true);
  });

  it("detects completion directly from a persisted turn id", () => {
    const history = [
      message("backend-assistant", "assistant", "已完成", 120, "turn-1"),
    ];

    expect(turnCompletedInHistory("turn-1", history)).toBe(true);
  });
});

describe("mergeHistorySnapshot", () => {
  it("replaces local turn messages with matching backend history", () => {
    const current = [
      message("user-turn-1", "user", "你好", 10, "turn-1"),
      message("assistant-turn-1", "assistant", "你好，有什么可以帮你？", 20, "turn-1"),
    ];
    const history = [
      message("backend-user-1", "user", "你好", 30, "turn-1"),
      message("backend-assistant-1", "assistant", "你好，有什么可以帮你？", 40, "turn-1"),
    ];

    const merged = mergeHistorySnapshot(current, history, "turn-1");

    expect(merged.map((item) => item.id)).toEqual(["backend-user-1", "backend-assistant-1"]);
  });

  it("replaces a completed local turn when the final local delta is newer than backend history", () => {
    const current = [
      message("user-turn-1", "user", "你好", 100, "turn-1"),
      message("assistant-turn-1", "assistant", "你好，有什么可以帮你？", 300, "turn-1"),
    ];
    const history = [
      message("backend-user-1", "user", "你好", 150, "turn-1"),
      message("backend-assistant-1", "assistant", "你好，有什么可以帮你？", 250, "turn-1"),
    ];

    const merged = mergeHistorySnapshot(current, history, "turn-1");

    expect(merged.map((item) => item.id)).toEqual(["backend-user-1", "backend-assistant-1"]);
  });

  it("replaces a completed local turn even when local partial text differs", () => {
    const current = [
      message("user-turn-1", "user", "你好", 100, "turn-1"),
      message("assistant-turn-1", "assistant", "正在生成", 120, "turn-1"),
    ];
    const history = [
      message("backend-user-1", "user", "你好", 150, "turn-1"),
      message("backend-assistant-1", "assistant", "你好！有什么我可以帮你的吗？", 250, "turn-1"),
    ];

    const merged = mergeHistorySnapshot(current, history, "turn-1");

    expect(merged.map((item) => item.id)).toEqual(["backend-user-1", "backend-assistant-1"]);
  });

  it("keeps the protected in-flight turn when a stale snapshot has the same user text", () => {
    const current = [
      message("backend-user-1", "user", "你好", 10),
      message("backend-assistant-1", "assistant", "第一轮回复", 20),
      message("user-turn-2", "user", "你好", 30, "turn-2"),
      message("assistant-turn-2", "assistant", "正在生成", 40, "turn-2"),
    ];
    const staleHistory = [
      message("backend-user-1", "user", "你好", 10),
      message("backend-assistant-1", "assistant", "第一轮回复", 20),
    ];

    const merged = mergeHistorySnapshot(current, staleHistory, "turn-2");

    expect(merged.map((item) => item.id)).toEqual([
      "backend-user-1",
      "backend-assistant-1",
      "user-turn-2",
      "assistant-turn-2",
    ]);
  });

  it("keeps a protected assistant reply even when it resembles an earlier turn", () => {
    const current = [
      message("backend-user-1", "user", "你好", 10, "turn-1"),
      message("backend-assistant-1", "assistant", "你好，有什么可以帮你？", 20, "turn-1"),
      message("user-turn-2", "user", "你好", 30, "turn-2"),
      message("assistant-turn-2", "assistant", "你好，有什么可以帮你？", 40, "turn-2"),
    ];
    const staleHistory = [
      message("backend-user-1", "user", "你好", 10, "turn-1"),
      message("backend-assistant-1", "assistant", "你好，有什么可以帮你？", 20, "turn-1"),
    ];

    const merged = mergeHistorySnapshot(current, staleHistory, "turn-2");

    expect(merged.map((item) => item.id)).toEqual([
      "backend-user-1",
      "backend-assistant-1",
      "user-turn-2",
      "assistant-turn-2",
    ]);
  });

  it("does not collapse repeated completed turns from backend history", () => {
    const history = [
      message("backend-user-1", "user", "你好", 10),
      message("backend-assistant-1", "assistant", "回复", 20),
      message("backend-user-2", "user", "你好", 30),
      message("backend-assistant-2", "assistant", "回复", 40),
    ];

    const merged = mergeHistorySnapshot([], history);

    expect(merged.map((item) => item.id)).toEqual([
      "backend-user-1",
      "backend-assistant-1",
      "backend-user-2",
      "backend-assistant-2",
    ]);
  });

  it("drops unprotected local assistant leftovers when backend history arrives", () => {
    const current = [
      message("backend-user-1", "user", "第一句", 10),
      message("backend-assistant-1", "assistant", "第一轮回复", 20),
      message("assistant-stale", "assistant", "上次残留的回复", 30, "turn-stale"),
    ];
    const history = [
      message("backend-user-1", "user", "第一句", 10),
      message("backend-assistant-1", "assistant", "第一轮回复", 20),
    ];

    const merged = mergeHistorySnapshot(current, history);

    expect(merged.map((item) => item.id)).toEqual(["backend-user-1", "backend-assistant-1"]);
  });
});
