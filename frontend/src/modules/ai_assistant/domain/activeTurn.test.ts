// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  activeTurnIsPending,
  currentTurnIsLive,
  type ChatMessage,
} from "@/modules/ai_assistant/public";

const NOW = 10 * 60 * 60 * 1000;

function message(
  id: string,
  role: ChatMessage["role"],
  turnId: string,
  text = "",
  raw?: unknown,
): ChatMessage {
  return { id, role, turnId, text, raw, timestamp: NOW };
}

describe("AI Assistant active turn status", () => {
  it("keeps a turn pending after its user message arrives", () => {
    const messages = [message("user-1", "user", "turn-1", "开始生成")];

    expect(activeTurnIsPending(messages, "turn-1")).toBe(true);
    expect(currentTurnIsLive("turn-1", messages)).toBe(true);
    expect(activeTurnIsPending(messages, "turn-missing")).toBe(false);
  });

  it("completes a turn after a textual assistant response", () => {
    const messages = [
      message("user-1", "user", "turn-1", "开始生成"),
      message("assistant-1", "assistant", "turn-1", "已完成"),
    ];

    expect(activeTurnIsPending(messages, "turn-1")).toBe(false);
    expect(currentTurnIsLive("turn-1", messages)).toBe(false);
  });

  it("completes a turn after a structured assistant response without text", () => {
    const messages = [
      message("user-1", "user", "turn-1", "开始生成"),
      message("assistant-1", "assistant", "turn-1", "", {
        type: "ui_spec",
        spec: { root: "root", elements: {} },
      }),
    ];

    expect(activeTurnIsPending(messages, "turn-1")).toBe(false);
  });
});
