// Copyright (c) 2026 AI anime
import { File as FileIcon, Image } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import { calculateTimelineContextDelta } from "@/modules/ai_assistant/presentation/timelineScroll";
import { cn } from "@/lib/utils";

type TimelineTurn = {
  id: string;
  index: number;
  preview: string;
  timestamp: number;
  hasAttachment: boolean;
  hasImage: boolean;
};

function buildTimelineTurns(messages: ChatMessage[]): TimelineTurn[] {
  return messages
    .filter((message) => message.role === "user")
    .map((message, index) => {
      const attachments = message.attachments ?? [];
      const hasImage = attachments.some((attachment) =>
        attachment.mimeType?.startsWith("image/"),
      );
      const hasAttachment = attachments.length > 0;
      const preview =
        message.text.trim().slice(0, 60) ||
        (hasImage ? "Image" : hasAttachment ? "File" : "...");
      return {
        id: message.id,
        index,
        preview,
        timestamp: message.timestamp,
        hasAttachment,
        hasImage,
      };
    });
}

export function ChatTimeline({
  messages,
  scrollRef,
}: {
  messages: ChatMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const turns = useMemo(() => buildTimelineTurns(messages), [messages]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hoveredTurn, setHoveredTurn] = useState<{
    index: number;
    top: number;
    right: number;
  } | null>(null);
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);
  const timelineListRef = useRef<HTMLDivElement | null>(null);
  const [scrollEdges, setScrollEdges] = useState({ up: false, down: false });

  const updateScrollEdges = useCallback(() => {
    const list = timelineListRef.current;
    if (!list) return;
    const next = {
      up: list.scrollTop > 1,
      down: list.scrollTop + list.clientHeight < list.scrollHeight - 1,
    };
    setScrollEdges((current) =>
      current.up === next.up && current.down === next.down ? current : next,
    );
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || turns.length < 2) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const targetY = containerRect.top + containerRect.height / 3;
      let closest = -1;
      let closestDistance = Infinity;

      for (let index = turns.length - 1; index >= 0; index -= 1) {
        const element = container.querySelector(
          `[data-turn-id="${CSS.escape(turns[index].id)}"]`,
        );
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - targetY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = index;
        }
      }
      setActiveIndex(closest);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener("scroll", handleScroll);
  }, [scrollRef, turns]);

  useEffect(() => {
    const list = timelineListRef.current;
    const button = activeButtonRef.current;
    if (!list || !button) return;
    const listRect = list.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const edgePadding = 8;
    if (buttonRect.top < listRect.top + edgePadding) {
      list.scrollBy({
        top: buttonRect.top - listRect.top - edgePadding,
        behavior: "auto",
      });
    } else if (buttonRect.bottom > listRect.bottom - edgePadding) {
      list.scrollBy({
        top: buttonRect.bottom - listRect.bottom + edgePadding,
        behavior: "auto",
      });
    }
  }, [activeIndex]);

  useEffect(() => {
    const list = timelineListRef.current;
    if (!list) return;
    updateScrollEdges();
    list.addEventListener("scroll", updateScrollEdges, { passive: true });
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollEdges);
    resizeObserver?.observe(list);
    return () => {
      list.removeEventListener("scroll", updateScrollEdges);
      resizeObserver?.disconnect();
    };
  }, [turns.length, updateScrollEdges]);

  const scrollToTurn = useCallback(
    (turn: TimelineTurn) => {
      const container = scrollRef.current;
      if (!container) return;
      const element = container.querySelector(
        `[data-turn-id="${CSS.escape(turn.id)}"]`,
      );
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [scrollRef],
  );

  const revealTimelineContext = useCallback((button: HTMLButtonElement) => {
    const list = timelineListRef.current;
    if (!list) return;
    const listRect = list.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const delta = calculateTimelineContextDelta({
      viewportHeight: list.clientHeight,
      nodeCenter: buttonRect.top - listRect.top + buttonRect.height / 2,
      scrollTop: list.scrollTop,
      scrollHeight: list.scrollHeight,
    });
    if (Math.abs(delta) < 1) return;
    list.scrollTo({ top: list.scrollTop + delta, behavior: "smooth" });
  }, []);

  if (turns.length < 2) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 right-1 top-4 z-20 hidden w-9 select-none lg:flex">
      <div className="pointer-events-auto relative flex h-full w-full justify-center">
        <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-border/70" />
        <div
          ref={timelineListRef}
          className="flex max-h-full flex-col items-center gap-2 overflow-y-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {turns.map((turn, index) => (
            <button
              key={turn.id}
              ref={index === activeIndex ? activeButtonRef : null}
              type="button"
              className="group/timeline-dot relative z-10 flex h-6 w-4 shrink-0 items-center justify-center"
              onClick={(event) => {
                revealTimelineContext(event.currentTarget);
                scrollToTurn(turn);
              }}
              onMouseEnter={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setHoveredTurn({
                  index,
                  top: rect.top + rect.height / 2,
                  right: window.innerWidth - rect.left + 12,
                });
              }}
              onMouseLeave={() => setHoveredTurn(null)}
              aria-label={`Turn ${index + 1}: ${turn.preview}`}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "rounded-full border transition-[width,height,background-color,border-color] duration-150",
                  index === activeIndex
                    ? turns.length > 80
                      ? "size-2 border-primary bg-primary"
                      : turns.length > 40
                        ? "size-2.5 border-primary bg-primary"
                        : "size-3 border-primary bg-primary"
                    : cn(
                        "border-muted-foreground/40 bg-background group-hover/timeline-dot:border-primary group-hover/timeline-dot:bg-primary/20",
                        turns.length > 80
                          ? "size-1.5"
                          : turns.length > 40
                            ? "size-2"
                            : "size-2.5",
                      ),
                )}
              />
            </button>
          ))}
        </div>
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 z-20 h-10 bg-gradient-to-b from-background via-background/55 to-transparent transition-opacity duration-200",
            scrollEdges.up ? "opacity-75" : "opacity-0",
          )}
          aria-hidden="true"
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 bg-gradient-to-t from-background via-background/55 to-transparent transition-opacity duration-200",
            scrollEdges.down ? "opacity-75" : "opacity-0",
          )}
          aria-hidden="true"
        />
      </div>
      {hoveredTurn &&
        turns[hoveredTurn.index] &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[80] -translate-y-1/2"
            style={{ top: hoveredTurn.top, right: hoveredTurn.right }}
          >
            <div className="max-w-[240px] rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
              <div className="flex items-center gap-1 font-medium">
                {turns[hoveredTurn.index].hasImage && (
                  <Image className="size-3 shrink-0 text-muted-foreground" />
                )}
                {turns[hoveredTurn.index].hasAttachment &&
                  !turns[hoveredTurn.index].hasImage && (
                    <FileIcon className="size-3 shrink-0 text-muted-foreground" />
                  )}
                <span className="line-clamp-3 whitespace-normal break-words">
                  {turns[hoveredTurn.index].preview}
                </span>
              </div>
              <div className="mt-1 text-muted-foreground">
                {new Date(
                  turns[hoveredTurn.index].timestamp,
                ).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
