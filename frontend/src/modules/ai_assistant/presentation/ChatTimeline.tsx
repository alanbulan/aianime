// Copyright (c) 2026 AI anime
import { File as FileIcon, Image } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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

const TIMELINE_BUTTON_HEIGHT = 24;
const TIMELINE_ROW_HEIGHT = 32;

function buildTimelineTurns(messages: ChatMessage[]): TimelineTurn[] {
  const turns: TimelineTurn[] = [];
  for (const message of messages) {
    if (message.role !== "user") continue;
    const attachments = message.attachments ?? [];
    const hasImage = attachments.some((attachment) =>
      attachment.mimeType?.startsWith("image/"),
    );
    const hasAttachment = attachments.length > 0;
    const preview =
      message.text.trim().slice(0, 60) ||
      (hasImage ? "Image" : hasAttachment ? "File" : "...");
    turns.push({
      id: message.id,
      index: turns.length,
      preview,
      timestamp: message.timestamp,
      hasAttachment,
      hasImage,
    });
  }
  return turns;
}

export function ChatTimeline({
  activeTurnId,
  messages,
  onSelectTurn,
}: {
  activeTurnId: string | null;
  messages: ChatMessage[];
  onSelectTurn: (turnId: string) => void;
}) {
  const turns = useMemo(() => buildTimelineTurns(messages), [messages]);
  const turnIndexById = useMemo(() => {
    const indexById = new Map<string, number>();
    turns.forEach((turn, index) => indexById.set(turn.id, index));
    return indexById;
  }, [turns]);
  const activeIndex = activeTurnId
    ? turnIndexById.get(activeTurnId) ?? -1
    : -1;
  const [hoveredTurn, setHoveredTurn] = useState<{
    index: number;
    top: number;
    right: number;
  } | null>(null);
  const timelineListRef = useRef<HTMLDivElement | null>(null);
  const [scrollEdges, setScrollEdges] = useState({ up: false, down: false });
  const timelineVirtualizer = useVirtualizer({
    count: turns.length,
    getScrollElement: () => timelineListRef.current,
    estimateSize: () => TIMELINE_ROW_HEIGHT,
    getItemKey: (index) => turns[index]?.id ?? index,
    overscan: 8,
    useAnimationFrameWithResizeObserver: true,
    useFlushSync: false,
  });

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
    if (activeIndex < 0) return;
    timelineVirtualizer.scrollToIndex(activeIndex, {
      align: "auto",
      behavior: "auto",
    });
  }, [activeIndex, timelineVirtualizer]);

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
      onSelectTurn(turn.id);
    },
    [onSelectTurn],
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
          className="flex max-h-full flex-col items-center overflow-y-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div
            className="relative w-4 shrink-0"
            style={{
              height: Math.max(
                0,
                timelineVirtualizer.getTotalSize()
                  - (TIMELINE_ROW_HEIGHT - TIMELINE_BUTTON_HEIGHT),
              ),
            }}
          >
            {timelineVirtualizer.getVirtualItems().map((virtualRow) => {
              const turn = turns[virtualRow.index];
              if (!turn) return null;
              const index = virtualRow.index;
              return (
                <button
                  key={virtualRow.key}
                  type="button"
                  className="group/timeline-dot absolute left-0 top-0 z-10 flex h-6 w-4 items-center justify-center"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
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
              );
            })}
          </div>
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
