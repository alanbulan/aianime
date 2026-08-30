// Copyright (c) 2026 AI anime
import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DotsIndicator,
  MessageBubble,
  ToolExecutionList,
} from "@/modules/ai_assistant/presentation/ChatMessageView";
import { ChatTimeline } from "@/modules/ai_assistant/presentation/ChatTimeline";
import {
  calculateTimelineTurnScrollTop,
  TIMELINE_ACTIVE_VIEWPORT_RATIO,
} from "@/modules/ai_assistant/presentation/timelineScroll";
import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import { isToolMessage } from "@/modules/ai_assistant/domain/messagePresentationRules";
import type { SpecMediaDetail } from "@/modules/ai_assistant/presentation/SpecMediaModals";
import {
  taskErrorMessage,
  useTaskCenterStore,
  type TaskState,
} from "@/modules/task_execution/public";
import { cn } from "@/lib/utils";

type MessageGroup =
  | { kind: "message"; message: ChatMessage }
  | { kind: "tools"; id: string; messages: ChatMessage[]; turnId?: string };

type MessageRow = MessageGroup | {
  kind: "streaming";
  id: "streaming";
  message: ChatMessage;
};

const DEFAULT_MESSAGE_ROW_HEIGHT = 160;
const ignoreMessageAction = () => undefined;

function groupToolMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    if (!isToolMessage(message)) {
      groups.push({ kind: "message", message });
      continue;
    }
    const previous = groups[groups.length - 1];
    if (
      previous?.kind === "tools"
      && previous.turnId === message.turnId
    ) {
      previous.messages.push(message);
      continue;
    }
    groups.push({
      kind: "tools",
      id: `tools-${message.turnId ?? "unscoped"}-${message.id}`,
      messages: [message],
      turnId: message.turnId,
    });
  }
  return groups;
}

function waitTaskKey(message: ChatMessage): string | null {
  if (
    message.toolName !== "ai_anime_wait_task"
    || message.toolState === "success"
    || !message.toolInput
    || typeof message.toolInput !== "object"
  ) {
    return null;
  }
  const value = (message.toolInput as Record<string, unknown>).task_key;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function reconcileWaitTaskMessages(
  messages: ChatMessage[],
  tasks: ReadonlyMap<string, TaskState>,
  failureMessage: (task: TaskState) => string,
): ChatMessage[] {
  return messages.map((message) => {
    const taskKey = waitTaskKey(message);
    const task = taskKey ? tasks.get(taskKey) : undefined;
    if (!task) return message;
    if (task.status === "completed") {
      return {
        ...message,
        toolState: "success",
        toolOutput: task.result,
        toolError: undefined,
      };
    }
    if (task.status === "failed" || task.status === "cancelled") {
      return {
        ...message,
        toolState: "error",
        toolError: failureMessage(task),
      };
    }
    return {
      ...message,
      toolState: "pending",
      toolError: undefined,
    };
  });
}

export type ChatMessageAreaProps = {
  busy: boolean;
  connected: boolean;
  connecting: boolean;
  currentStreamingAssistantId: string | null;
  deferStructuredRender: boolean;
  historyReady: boolean;
  isFreezoneLayout: boolean;
  messageListRef: RefObject<HTMLDivElement | null>;
  excludedIds: ReadonlySet<string>;
  pinnedIds: ReadonlySet<string>;
  scrollRef: RefObject<HTMLDivElement | null>;
  showScrollToBottom: boolean;
  showWaitingIndicator: boolean;
  streamText: string;
  streamTextAlreadyRendered: boolean;
  streamingAssistantId: string | null;
  totalMessageCount: number;
  variant: "default" | "freezone";
  visibleMessages: ChatMessage[];
  onDeleteMessage: (messageId: string) => void;
  onOpenDetail: (message: ChatMessage) => void;
  onOpenMedia: (detail: SpecMediaDetail) => void;
  onScrollToBottom: (behavior?: ScrollBehavior) => void;
  onTogglePin: (messageId: string) => void;
};

export function ChatMessageArea({
  busy,
  connected,
  connecting,
  currentStreamingAssistantId,
  deferStructuredRender,
  historyReady,
  isFreezoneLayout,
  messageListRef,
  excludedIds,
  pinnedIds,
  scrollRef,
  showScrollToBottom,
  showWaitingIndicator,
  streamText,
  streamTextAlreadyRendered,
  streamingAssistantId,
  totalMessageCount,
  variant,
  visibleMessages,
  onDeleteMessage,
  onOpenDetail,
  onOpenMedia,
  onScrollToBottom,
  onTogglePin,
}: ChatMessageAreaProps) {
  const { t } = useTranslation();
  const tasks = useTaskCenterStore((state) => state.tasks);
  const isChatInitializing =
    !historyReady
    && totalMessageCount === 0
    && (connecting || connected);
  const reconciledMessages = useMemo(
    () => reconcileWaitTaskMessages(
      visibleMessages,
      tasks,
      (task) => taskErrorMessage(task, t),
    ),
    [tasks, t, visibleMessages],
  );
  const messageGroups = useMemo(
    () => groupToolMessages(reconciledMessages),
    [reconciledMessages],
  );
  const messageRows = useMemo<MessageRow[]>(() => {
    if (!streamText || streamTextAlreadyRendered) return messageGroups;
    return [
      ...messageGroups,
      {
        kind: "streaming",
        id: "streaming",
        message: {
          id: "streaming",
          role: "assistant",
          text: streamText,
          timestamp: Date.now(),
        },
      },
    ];
  }, [messageGroups, streamText, streamTextAlreadyRendered]);
  const rowVirtualizer = useVirtualizer({
    count: messageRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DEFAULT_MESSAGE_ROW_HEIGHT,
    getItemKey: (index) => {
      const row = messageRows[index];
      if (!row) return index;
      return row.kind === "message" ? row.message.id : row.id;
    },
    gap: isFreezoneLayout ? 16 : 20,
    overscan: 6,
    useAnimationFrameWithResizeObserver: true,
    useFlushSync: false,
  });
  const [selectedTimelineTurnId, setSelectedTimelineTurnId] = useState<string | null>(null);
  const turnRowIndexById = useMemo(() => {
    const indexById = new Map<string, number>();
    messageRows.forEach((row, index) => {
      if (row.kind === "message" && row.message.role === "user") {
        indexById.set(row.message.id, index);
      }
    });
    return indexById;
  }, [messageRows]);
  const turnIdAtRowIndex = useMemo(() => {
    let currentTurnId: string | null = null;
    return messageRows.map((row) => {
      if (row.kind === "message" && row.message.role === "user") {
        currentTurnId = row.message.id;
      }
      return currentTurnId;
    });
  }, [messageRows]);
  const targetRow = rowVirtualizer.getVirtualItemForOffset(
    (rowVirtualizer.scrollOffset ?? 0)
    + (rowVirtualizer.scrollRect?.height ?? 0) * TIMELINE_ACTIVE_VIEWPORT_RATIO,
  );
  const visibleActiveTurnId = targetRow
    ? turnIdAtRowIndex[targetRow.index] ?? null
    : null;
  const activeTurnId = selectedTimelineTurnId
    && turnRowIndexById.has(selectedTimelineTurnId)
    ? selectedTimelineTurnId
    : visibleActiveTurnId;
  const handleSelectTurn = useCallback((turnId: string) => {
    const index = turnRowIndexById.get(turnId);
    if (index === undefined) return;
    setSelectedTimelineTurnId(turnId);
    const viewportHeight = rowVirtualizer.scrollRect?.height
      ?? scrollRef.current?.clientHeight
      ?? 0;
    const offsetInfo = rowVirtualizer.getOffsetForIndex(index, "start");
    if (!offsetInfo || viewportHeight <= 0) {
      rowVirtualizer.scrollToIndex(index, { align: "start", behavior: "auto" });
      return;
    }
    const totalSize = rowVirtualizer.getTotalSize();
    const maxScrollTop = Math.max(0, totalSize - viewportHeight);
    const publicItemStart = offsetInfo[0];
    const targetScrollTop = publicItemStart >= maxScrollTop
      ? maxScrollTop
      : calculateTimelineTurnScrollTop({
          itemStart: publicItemStart,
          viewportHeight,
          totalSize,
        });
    rowVirtualizer.scrollToOffset(targetScrollTop, { behavior: "auto" });
  }, [rowVirtualizer, scrollRef, turnRowIndexById]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return undefined;
    const releaseTimelineSelection = () => setSelectedTimelineTurnId(null);
    scrollElement.addEventListener("pointerdown", releaseTimelineSelection, { passive: true });
    scrollElement.addEventListener("touchstart", releaseTimelineSelection, { passive: true });
    scrollElement.addEventListener("wheel", releaseTimelineSelection, { passive: true });
    return () => {
      scrollElement.removeEventListener("pointerdown", releaseTimelineSelection);
      scrollElement.removeEventListener("touchstart", releaseTimelineSelection);
      scrollElement.removeEventListener("wheel", releaseTimelineSelection);
    };
  }, [scrollRef]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        className={cn(
          "h-full overflow-y-auto px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          isFreezoneLayout && "px-2.5 py-3",
        )}
      >
        {isChatInitializing ? (
          <div className={cn(
            "mx-auto flex h-full w-full max-w-[760px] items-center justify-center text-center",
            isFreezoneLayout && "max-w-none",
          )}>
            <div className="max-w-72 text-sm text-muted-foreground">
              <div className="mb-3 flex justify-center text-primary" aria-hidden="true">
                <DotsIndicator />
              </div>
              <div className="mb-2 font-medium text-foreground">
                {connected
                  ? t("aiAssistant.syncingHistoryTitle")
                  : t("aiAssistant.connecting")}
              </div>
              <div className="text-xs leading-5">
                {t("aiAssistant.syncingHistoryDescription")}
              </div>
            </div>
          </div>
        ) : totalMessageCount === 0 && !streamText && !showWaitingIndicator ? (
          <div className={cn(
            "mx-auto flex h-full w-full max-w-[760px] items-center justify-center text-center",
            isFreezoneLayout && "max-w-none",
          )}>
            <div className="max-w-64 text-sm text-muted-foreground">
              <div className="mb-2 font-medium text-foreground">
                {t("aiAssistant.emptyTitle")}
              </div>
              <div className="text-xs leading-5">
                {t("aiAssistant.emptyDescription")}
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={messageListRef}
            className={cn(
              "relative mx-auto w-full max-w-[760px]",
              isFreezoneLayout && "max-w-none",
            )}
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = messageRows[virtualRow.index];
              if (!row) return null;
              const message = row.kind === "message" || row.kind === "streaming"
                ? row.message
                : null;
              return (
                <div
                  key={virtualRow.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  data-message-id={message?.id}
                  data-turn-id={message?.role === "user" ? message.id : undefined}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.kind === "tools" ? (
                    <ToolExecutionList messages={row.messages} />
                  ) : (
                    <MessageBubble
                      message={row.message}
                      variant={variant}
                      onOpenDetail={onOpenDetail}
                      onOpenMedia={onOpenMedia}
                      pinned={
                        row.kind === "message"
                        && pinnedIds.has(row.message.id)
                      }
                      excluded={
                        row.kind === "message"
                        && excludedIds.has(row.message.id)
                      }
                      onDelete={
                        row.kind === "streaming"
                          ? ignoreMessageAction
                          : onDeleteMessage
                      }
                      onTogglePin={
                        row.kind === "streaming"
                          ? ignoreMessageAction
                          : onTogglePin
                      }
                      deferStructuredRender={
                        deferStructuredRender
                        && (
                          row.kind === "streaming"
                          || (
                            row.message.role === "assistant"
                            && row.message.id === currentStreamingAssistantId
                          )
                        )
                      }
                      streaming={
                        row.kind === "streaming"
                          ? busy
                          : row.message.role === "assistant"
                            && row.message.id === streamingAssistantId
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showScrollToBottom && (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={cn(
            "absolute bottom-4 left-1/2 z-30 h-9 w-9 -translate-x-1/2 rounded-full border border-border bg-card text-foreground shadow-lg transition hover:bg-muted",
            isFreezoneLayout && "bottom-3",
          )}
          data-ui-tooltip="回到底部"
          aria-label="回到底部"
          onClick={() => onScrollToBottom("auto")}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
      {!isFreezoneLayout && (
        <ChatTimeline
          activeTurnId={activeTurnId}
          messages={visibleMessages}
          onSelectTurn={handleSelectTurn}
        />
      )}
    </div>
  );
}
