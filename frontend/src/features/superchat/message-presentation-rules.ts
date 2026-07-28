// Copyright (c) 2026 AI anime
import type { ChatMessage } from "@/features/superchat/types";

const ASSISTANT_ERROR_TEXT_PATTERNS: RegExp[] = [
  /模型内容安全过滤拦截/u,
  /Render 任务没有生成可用图片/u,
  /错误原因：.+/u,
  /生成.+失败/u,
  /任务.+失败/u,
  /没有成功启动/u,
  /请先根据返回的错误/u,
  /content filter triggered/i,
  /finish reason:\s*['"]?content_filter/i,
];

const ASSISTANT_COMPLETION_TEXT_PATTERN = /^✅ .+?已完成。/u;

export function isToolMessage(message: ChatMessage): boolean {
  if (message.role === "tool") return true;
  if (!message.raw || typeof message.raw !== "object") return false;
  const raw = message.raw as Record<string, unknown>;
  const role = raw.role;
  const type = raw.type;
  return (
    role === "trace"
    || role === "tool"
    || role === "tool_result"
    || role === "toolResult"
    || type === "tool.result"
    || type === "tool_update"
  );
}

export function isHistoricalToolMessage(message: ChatMessage): boolean {
  const raw = message.raw && typeof message.raw === "object"
    ? (message.raw as Record<string, unknown>)
    : {};
  return raw.role === "trace";
}

export function normalizeMessageText(text: string): string {
  return text.trim().replace(/\n{3,}/g, "\n\n");
}

export function isAssistantErrorReply(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  const text = message.text.trim();
  if (!text) return false;
  return ASSISTANT_ERROR_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

export function assistantCompletionTextEnd(text: string): number | null {
  const match = ASSISTANT_COMPLETION_TEXT_PATTERN.exec(text);
  return match ? match[0].length : null;
}

export function isAssistantCompletionNotice(message: ChatMessage): boolean {
  return (
    message.role === "assistant"
    && assistantCompletionTextEnd(message.text.trim()) !== null
  );
}

export function errorTextRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const pattern of ASSISTANT_ERROR_TEXT_PATTERNS) {
    const match = pattern.exec(text);
    if (!match || match.index < 0) continue;
    const start = match.index;
    let end = start + match[0].length;
    while (end < text.length && !/[。！？\n]/u.test(text[end])) {
      end += 1;
    }
    if (end < text.length && /[。！？]/u.test(text[end])) {
      end += 1;
    }
    ranges.push([start, end]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}
