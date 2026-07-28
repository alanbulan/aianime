// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendToolMessage,
  shouldPreserveToolMessage,
  upsertAssistantMessage,
  upsertServerAssistantMessage,
  upsertToolMessage,
} from "@/features/superchat/message-projection";
import type { ChatMessage, ServerFrame } from "@/features/superchat/types";

const NOW = 1_000;

function message(
  id: string,
  role: ChatMessage["role"],
  text: string,
  timestamp: number,
  turnId?: string,
): ChatMessage {
  return { id, role, text, timestamp, turnId };
}

describe("assistant message projection", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds a deterministic transient assistant message after its user message", () => {
    const current = [message("user-1", "user", "开始", 10, "turn-1")];

    const result = upsertAssistantMessage(current, "turn-1", "生成中");

    expect(result).toMatchObject([
      { id: "user-1", role: "user" },
      {
        id: "assistant-turn-1",
        role: "assistant",
        text: "生成中",
        turnId: "turn-1",
        timestamp: NOW,
      },
    ]);
    expect(current).toHaveLength(1);
  });

  it("updates an existing transient assistant message without duplicating it", () => {
    const current = [
      message("user-1", "user", "开始", 10, "turn-1"),
      {
        ...message("assistant-turn-1", "assistant", "旧内容", 20, "turn-1"),
        raw: { keep: true },
      },
    ];

    const result = upsertAssistantMessage(current, "turn-1", "新内容");

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      id: "assistant-turn-1",
      text: "新内容",
      timestamp: NOW,
      raw: { keep: true },
    });
  });

  it("returns the current array when a server assistant payload is empty", () => {
    const current = [message("user-1", "user", "开始", 10, "turn-1")];

    expect(upsertServerAssistantMessage(current, null, "turn-1")).toBe(current);
  });

  it("replaces the transient assistant with the final server message", () => {
    const current = [
      message("user-1", "user", "开始", 10, "turn-1"),
      message("assistant-turn-1", "assistant", "生成中", 20, "turn-1"),
      message("assistant-other", "assistant", "其他回合", 5, "turn-2"),
    ];

    const result = upsertServerAssistantMessage(
      current,
      {
        id: "server-assistant-1",
        role: "assistant",
        content: "已完成",
        timestamp: 30,
      },
      "turn-1",
    );

    expect(result.some((item) => item.id === "assistant-turn-1")).toBe(false);
    expect(result).toContainEqual(expect.objectContaining({
      id: "server-assistant-1",
      text: "已完成",
      turnId: "turn-1",
    }));
    expect(result).toContainEqual(expect.objectContaining({ id: "assistant-other" }));
  });

  it("prefers the turn ID carried by the server message", () => {
    const result = upsertServerAssistantMessage(
      [],
      {
        id: "server-assistant-1",
        content: "已完成",
        turn_id: "turn-server",
        timestamp: 30,
      },
      "turn-frame",
    );

    expect(result[0]?.turnId).toBe("turn-server");
  });
});

describe("tool message projection", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      "hidden executable tool call",
      { type: "tool.call", name: "freezone_emit_canvas_command" },
      true,
    ],
    [
      "string command result",
      { type: "tool.result", result: "canvas_chat_commands.v1" },
      true,
    ],
    [
      "object command result",
      { type: "tool.result", result: { text: "canvas_command_emitted" } },
      true,
    ],
    [
      "unrelated tool result",
      { type: "tool.result", name: "search", result: "done" },
      false,
    ],
    [
      "non-tool frame",
      { type: "error", message: "canvas_command_emitted" },
      false,
    ],
  ] satisfies Array<[string, ServerFrame, boolean]>) (
    "%s preservation is %s",
    (_label, frame, expected) => {
      expect(shouldPreserveToolMessage(frame)).toBe(expected);
    },
  );

  it("appends a tool result without a turn ID and formats object output", () => {
    const payload = { name: "search", result: { value: 1 } };

    const result = upsertToolMessage([], "tool.result", payload);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      role: "tool",
      turnId: undefined,
      timestamp: NOW,
      raw: payload,
    });
    expect(result[0]?.text).toContain("search\n\n{");
    expect(result[0]?.text).toContain('"value": 1');
  });

  it("appends a project event without reordering the existing timeline", () => {
    const current = [message("future-message", "assistant", "保留顺序", NOW + 1)];
    const payload = { type: "project.created", project: "project-a" };

    const result = appendToolMessage(current, "project.created", payload);

    expect(result.map((item) => item.id)).toEqual([
      "future-message",
      expect.stringMatching(/^project\.created-/),
    ]);
    expect(result[1]).toMatchObject({
      role: "tool",
      text: expect.stringContaining("project.created"),
      raw: payload,
      timestamp: NOW,
    });
  });

  it("updates the existing tool message for the same turn while preserving its ID", () => {
    const current = [
      message("user-1", "user", "开始", 10, "turn-1"),
      message("tool-existing", "tool", "旧结果", 20, "turn-1"),
      message("assistant-1", "assistant", "完成", 30, "turn-1"),
    ];
    const payload = {
      name: "search",
      result: "新结果",
      turn_id: "turn-1",
    };

    const result = upsertToolMessage(current, "tool.result", payload);

    expect(result.map((item) => item.id)).toEqual([
      "user-1",
      "tool-existing",
      "assistant-1",
    ]);
    expect(result[1]).toMatchObject({
      id: "tool-existing",
      text: "search\n\n新结果",
      timestamp: NOW,
      raw: payload,
    });
  });
});
