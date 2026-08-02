// Copyright (c) 2026 AI anime
import {
  normalizeMessage,
} from "@/modules/ai_assistant/domain/message";
import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import {
  isStaleByTtl,
  pruneLocalStorageByPrefix,
  registerStorageReclaimer,
  safeLocalStorageSet,
} from "@/lib/localStorageQuota";

const MESSAGE_CACHE_PREFIX = "superchat:messages:v2:";
const MESSAGE_CACHE_LIMIT = 50;
const MESSAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function messageCacheKey(scopeKey: string): string {
  return `${MESSAGE_CACHE_PREFIX}${scopeKey}`;
}

// normalizeMessage keeps its source under raw. Remove the previous source on
// each save so repeated load/save cycles cannot grow an unbounded raw chain.
function denestRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  if (!("raw" in raw)) return raw;
  const { raw: _nested, ...rest } = raw as Record<string, unknown>;
  return rest;
}

export function sanitizeMessagesForCache(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    const denestedRaw = denestRaw(message.raw);
    const attachments = message.attachments?.length
      ? message.attachments.map((attachment) => {
          if (attachment.content === undefined) return attachment;
          const { content: _content, ...rest } = attachment;
          return rest;
        })
      : message.attachments;
    if (denestedRaw === message.raw && attachments === message.attachments) {
      return message;
    }
    return { ...message, raw: denestedRaw, attachments };
  });
}

export function loadCachedMessages(scopeKey: string): ChatMessage[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(messageCacheKey(scopeKey)) || "null",
    ) as unknown;
    const raw = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { messages?: unknown })?.messages)
        ? (parsed as { messages: unknown[] }).messages
        : [];
    return raw
      .map((message) => normalizeMessage(message))
      .filter((message): message is ChatMessage => Boolean(message));
  } catch {
    return [];
  }
}

export function saveCachedMessages(
  scopeKey: string,
  messages: ChatMessage[],
  now = Date.now(),
): void {
  const payload = {
    updatedAt: now,
    messages: sanitizeMessagesForCache(messages.slice(-MESSAGE_CACHE_LIMIT)),
  };
  safeLocalStorageSet(messageCacheKey(scopeKey), JSON.stringify(payload));
}

export function pruneOldMessageCaches(now = Date.now()): void {
  pruneLocalStorageByPrefix(MESSAGE_CACHE_PREFIX, (_key, raw) => {
    let updatedAt: number | null = null;
    try {
      const parsed = JSON.parse(raw) as { updatedAt?: unknown } | null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : null;
      }
    } catch {
      updatedAt = null;
    }
    return updatedAt == null || isStaleByTtl(updatedAt, now, MESSAGE_CACHE_TTL_MS);
  });
}

registerStorageReclaimer(() => {
  pruneOldMessageCaches();
});
