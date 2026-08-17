// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearActiveTurn,
  loadPendingActiveTurn,
  saveActiveTurn,
  type ChatMessage,
} from "@/modules/ai_assistant/public";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = 2 * DAY_MS;
const ACTIVE_TURN_PREFIX = "superchat:active-turn:";

function activeTurnKey(scopeKey: string): string {
  return `${ACTIVE_TURN_PREFIX}${scopeKey}`;
}

function message(
  id: string,
  role: ChatMessage["role"],
  turnId: string,
  text = "",
  raw?: unknown,
): ChatMessage {
  return { id, role, turnId, text, raw, timestamp: NOW };
}

describe("AI Assistant active turn storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves and loads a scoped snapshot while ignoring blank turn IDs", () => {
    saveActiveTurn("project-a", "turn-1");
    saveActiveTurn("project-b", "   ");

    expect(
      loadPendingActiveTurn("project-a", [
        message("user-1", "user", "turn-1", "开始生成"),
      ]),
    ).toEqual({ turnId: "turn-1", startedAt: NOW });
    expect(localStorage.getItem(activeTurnKey("project-b"))).toBeNull();
  });

  it("returns null for missing and malformed snapshots", () => {
    expect(loadPendingActiveTurn("missing", [])).toBeNull();

    localStorage.setItem(activeTurnKey("broken-json"), "{not json");
    localStorage.setItem(
      activeTurnKey("invalid-shape"),
      JSON.stringify({ turnId: 42, startedAt: "now" }),
    );

    expect(loadPendingActiveTurn("broken-json", [])).toBeNull();
    expect(loadPendingActiveTurn("invalid-shape", [])).toBeNull();
  });

  it("keeps long workflows for a day and removes older snapshots", () => {
    localStorage.setItem(
      activeTurnKey("project-a"),
      JSON.stringify({ turnId: "turn-1", startedAt: NOW - HOUR_MS }),
    );

    expect(
      loadPendingActiveTurn("project-a", [
        message("user-1", "user", "turn-1", "开始生成"),
      ]),
    ).not.toBeNull();

    localStorage.setItem(
      activeTurnKey("project-a"),
      JSON.stringify({ turnId: "turn-1", startedAt: NOW - DAY_MS - 1 }),
    );

    expect(
      loadPendingActiveTurn("project-a", [
        message("user-1", "user", "turn-1", "开始生成"),
      ]),
    ).toBeNull();
    expect(localStorage.getItem(activeTurnKey("project-a"))).toBeNull();
  });

  it("does not clear a newer active turn when an older turn completes", () => {
    saveActiveTurn("project-a", "turn-2");

    clearActiveTurn("project-a", "turn-1");

    expect(
      loadPendingActiveTurn("project-a", [
        message("user-2", "user", "turn-2", "继续生成"),
      ])?.turnId,
    ).toBe("turn-2");
  });

  it("clears a persisted turn after a textual assistant response", () => {
    saveActiveTurn("project-a", "turn-1");
    const messages = [
      message("user-1", "user", "turn-1", "开始生成"),
      message("assistant-1", "assistant", "turn-1", "已完成"),
    ];

    expect(loadPendingActiveTurn("project-a", messages)).toBeNull();
    expect(localStorage.getItem(activeTurnKey("project-a"))).toBeNull();
  });

  it("clears a persisted turn after a structured assistant response", () => {
    saveActiveTurn("project-a", "turn-1");
    const messages = [
      message("user-1", "user", "turn-1", "开始生成"),
      message("assistant-1", "assistant", "turn-1", "", {
        type: "ui_spec",
        spec: { root: "root", elements: {} },
      }),
    ];

    expect(loadPendingActiveTurn("project-a", messages)).toBeNull();
    expect(localStorage.getItem(activeTurnKey("project-a"))).toBeNull();
  });
});
