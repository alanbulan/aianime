// Copyright (c) 2026 AI anime
import { ArrowDown } from "lucide-react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DotsIndicator,
  MessageBubble,
} from "@/features/superchat/chat-message-view";
import { ChatTimeline } from "@/features/superchat/chat-timeline";
import type { SpecMediaDetail } from "@/features/superchat/spec-media-modals";
import type { ChatMessage } from "@/features/superchat/types";
import { cn } from "@/lib/utils";

export type ChatMessageAreaProps = {
  busy: boolean;
  connected: boolean;
  connecting: boolean;
  currentStreamingAssistantId: string | null;
  deferStructuredRender: boolean;
  historyReady: boolean;
  isFreezoneLayout: boolean;
  messageListRef: RefObject<HTMLDivElement | null>;
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
  const isChatInitializing =
    !historyReady
    && totalMessageCount === 0
    && (connecting || connected);

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
              "mx-auto w-full max-w-[760px] space-y-5",
              isFreezoneLayout && "max-w-none space-y-4",
            )}
          >
            {visibleMessages.map((message) => (
              <div
                key={message.id}
                data-message-id={message.id}
                data-turn-id={message.role === "user" ? message.id : undefined}
              >
                <MessageBubble
                  message={message}
                  variant={variant}
                  onOpenDetail={onOpenDetail}
                  onOpenMedia={onOpenMedia}
                  pinned={pinnedIds.has(message.id)}
                  onDelete={onDeleteMessage}
                  onTogglePin={onTogglePin}
                  deferStructuredRender={
                    deferStructuredRender
                    && message.role === "assistant"
                    && message.id === currentStreamingAssistantId
                  }
                  streaming={
                    message.role === "assistant"
                    && message.id === streamingAssistantId
                  }
                />
              </div>
            ))}
            {streamText && !streamTextAlreadyRendered && (
              <MessageBubble
                message={{
                  id: "streaming",
                  role: "assistant",
                  text: streamText,
                  timestamp: Date.now(),
                }}
                variant={variant}
                onOpenDetail={onOpenDetail}
                onOpenMedia={onOpenMedia}
                pinned={false}
                onDelete={() => undefined}
                onTogglePin={() => undefined}
                deferStructuredRender={deferStructuredRender}
                streaming={busy}
              />
            )}
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
          title="回到底部"
          aria-label="回到底部"
          onClick={() => onScrollToBottom("auto")}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
      {!isFreezoneLayout && (
        <ChatTimeline messages={visibleMessages} scrollRef={scrollRef} />
      )}
    </div>
  );
}
