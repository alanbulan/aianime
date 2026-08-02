// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";

type UseChatScrollControllerOptions = {
  activeMessageCount: number;
  busy: boolean;
  historyReady: boolean;
  lastActiveMessageId: string | null;
  messages: ChatMessage[];
  project?: string;
  showWaitingIndicator: boolean;
  streamText: string;
};

export function useChatScrollController({
  activeMessageCount,
  busy,
  historyReady,
  lastActiveMessageId,
  messages,
  project,
  showWaitingIndicator,
  streamText,
}: UseChatScrollControllerOptions) {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const historyScrollKeyRef = useRef<string | null>(null);

  const scrollToChatBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = scrollRef.current;
    if (!element) return;
    const top = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTo({ top, behavior });
    shouldStickToBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const updateStickiness = () => {
      const distanceToBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      shouldStickToBottomRef.current = distanceToBottom < 96;
      setShowScrollToBottom(distanceToBottom > 180);
    };
    updateStickiness();
    element.addEventListener("scroll", updateStickiness, { passive: true });
    return () => element.removeEventListener("scroll", updateStickiness);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (shouldStickToBottomRef.current || busy) {
        scrollToChatBottom();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, messages, scrollToChatBottom, showWaitingIndicator, streamText]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!shouldStickToBottomRef.current && !busy) return;
      window.requestAnimationFrame(() => scrollToChatBottom());
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [busy, scrollToChatBottom]);

  useEffect(() => {
    if (!historyReady) return;
    const scrollKey = `${project ?? ""}:${activeMessageCount}:${lastActiveMessageId}`;
    if (historyScrollKeyRef.current === scrollKey) return;
    historyScrollKeyRef.current = scrollKey;
    shouldStickToBottomRef.current = true;
    let secondFrame = 0;
    const firstTimeout = window.setTimeout(scrollToChatBottom, 120);
    const secondTimeout = window.setTimeout(scrollToChatBottom, 360);
    const thirdTimeout = window.setTimeout(scrollToChatBottom, 800);
    const firstFrame = window.requestAnimationFrame(() => {
      scrollToChatBottom();
      secondFrame = window.requestAnimationFrame(() => scrollToChatBottom());
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(firstTimeout);
      window.clearTimeout(secondTimeout);
      window.clearTimeout(thirdTimeout);
    };
  }, [
    activeMessageCount,
    historyReady,
    lastActiveMessageId,
    project,
    scrollToChatBottom,
  ]);

  return {
    messageListRef,
    scrollRef,
    scrollToChatBottom,
    showScrollToBottom,
  };
}
