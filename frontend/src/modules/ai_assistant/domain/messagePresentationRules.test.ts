// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  assistantCompletionTextEnd,
  errorTextRanges,
  isAssistantCompletionNotice,
  isAssistantErrorReply,
  isHistoricalToolMessage,
  isToolMessage,
  normalizeMessageText,
  type ChatMessage,
} from "@/modules/ai_assistant/public";

function message(
  role: ChatMessage["role"],
  text: string,
  raw?: unknown,
): ChatMessage {
  return { id: "message-1", role, text, timestamp: 1, raw };
}

describe("AI Assistant message presentation rules", () => {
  it("recognizes canonical and legacy tool-message envelopes", () => {
    expect(isToolMessage(message("tool", "result"))).toBe(true);
    expect(isToolMessage(message("assistant", "trace", { role: "trace" }))).toBe(true);
    expect(isToolMessage(message("assistant", "result", { role: "tool_result" }))).toBe(true);
    expect(isToolMessage(message("assistant", "update", { type: "tool_update" }))).toBe(true);
    expect(isToolMessage(message("assistant", "reply", { role: "assistant" }))).toBe(false);
  });

  it("marks only trace envelopes as historical tool messages", () => {
    expect(isHistoricalToolMessage(message("tool", "trace", { role: "trace" }))).toBe(true);
    expect(isHistoricalToolMessage(message("tool", "result", { role: "tool" }))).toBe(false);
    expect(isHistoricalToolMessage(message("tool", "result"))).toBe(false);
  });

  it("trims message text and collapses excessive blank lines", () => {
    expect(normalizeMessageText("  first\n\n\n\nsecond  ")).toBe(
      "first\n\nsecond",
    );
  });

  it("classifies assistant failures without flagging other roles", () => {
    expect(
      isAssistantErrorReply(message("assistant", "生成封面失败，请稍后重试。")),
    ).toBe(true);
    expect(
      isAssistantErrorReply(message("assistant", "finish reason: content_filter")),
    ).toBe(true);
    expect(
      isAssistantErrorReply(message("user", "生成封面失败，请稍后重试。")),
    ).toBe(false);
    expect(isAssistantErrorReply(message("assistant", "任务已完成"))).toBe(false);
  });

  it("returns sorted sentence ranges for highlighted errors", () => {
    const value = "没有成功启动。稍后 Render 任务没有生成可用图片！请检查。";
    const highlighted = errorTextRanges(value).map(([start, end]) =>
      value.slice(start, end),
    );

    expect(highlighted).toEqual([
      "没有成功启动。",
      "Render 任务没有生成可用图片！",
    ]);
  });

  it("shares the completion prefix boundary with notice classification", () => {
    const value = "✅ 视频已完成。继续处理下一镜。";
    const end = assistantCompletionTextEnd(value);

    expect(end).not.toBeNull();
    expect(value.slice(0, end ?? 0)).toBe("✅ 视频已完成。");
    expect(isAssistantCompletionNotice(message("assistant", `  ${value}`))).toBe(true);
    expect(isAssistantCompletionNotice(message("user", value))).toBe(false);
    expect(assistantCompletionTextEnd("视频已完成。")).toBeNull();
  });
});
