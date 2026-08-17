// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

import {
  activeConversationScopeKey,
  loadActiveConversation,
  saveActiveConversation,
} from "@/modules/ai_assistant/infrastructure/activeConversationStorage";

describe("activeConversationStorage", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the active conversation separate for every project", () => {
    const projectA = activeConversationScopeKey("alice", "project-a");
    const projectB = activeConversationScopeKey("alice", "project-b");

    saveActiveConversation(projectA, "chat-a");
    saveActiveConversation(projectB, "chat-b");

    expect(loadActiveConversation(projectA)).toBe("chat-a");
    expect(loadActiveConversation(projectB)).toBe("chat-b");
  });

  it("falls back to main and removes malformed state", () => {
    const scopeKey = activeConversationScopeKey("alice", "project-a");
    localStorage.setItem(
      `superchat:active-conversation:v1:${scopeKey}`,
      JSON.stringify({ version: 1, conversationId: "../invalid" }),
    );

    expect(loadActiveConversation(scopeKey)).toBe("main");
    expect(localStorage.length).toBe(0);
  });
});
