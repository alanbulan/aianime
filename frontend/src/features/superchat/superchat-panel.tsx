// Copyright (c) 2026 AI anime
import {
  ArrowDown,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/modules/identity_access/public";
import { cn } from "@/lib/utils";
import { useSuperChat } from "@/features/superchat/use-superchat";
import { ChatTimeline } from "@/features/superchat/chat-timeline";
import {
  DotsIndicator,
  MessageBubble,
} from "@/features/superchat/chat-message-view";
import {
  ControlBar,
  HeaderControlPortal,
} from "@/features/superchat/chat-control-bar";
import { ApprovalCard } from "@/features/superchat/approval-card";
import { SearchBar } from "@/features/superchat/chat-search-bar";
import { PinnedPanel } from "@/features/superchat/pinned-messages-panel";
import { MessageDetailPanel } from "@/features/superchat/message-detail-panel";
import { useIngestAutomationController } from "@/features/superchat/use-ingest-automation-controller";
import { useSpeechInputController } from "@/features/superchat/use-speech-input-controller";
import { useTaskCompletionNotifications } from "@/features/superchat/use-task-completion-notifications";
import { useChatScrollController } from "@/features/superchat/use-chat-scroll-controller";
import { useChatQueueController } from "@/features/superchat/use-chat-queue-controller";
import { useComposerBorderBeam } from "@/features/superchat/use-composer-border-beam";
import { useComposerHistoryNavigation } from "@/features/superchat/use-composer-history-navigation";
import { useComposerAttachmentsController } from "@/features/superchat/use-composer-attachments-controller";
import { ChatComposer } from "@/features/superchat/chat-composer";
import {
  SpecMediaDetailModal,
  type SpecMediaDetail,
} from "@/features/superchat/spec-media-modals";
import { projectPanelMessages } from "@/features/superchat/panel-message-projection";
import type { ChatMessage } from "@/features/superchat/types";
import { FormatCheckDetailsDialog } from "@/components/ingest/FormatCheckDetailsDialog";

const ENABLE_SUPERCHAT_FILE_UPLOAD = false;

type SuperChatPanelVariant = "default" | "freezone";

interface SuperChatPanelProps {
  variant?: SuperChatPanelVariant;
  onRequestClose?: () => void;
}

export function SuperChatPanel({
  variant = "default",
  onRequestClose,
}: SuperChatPanelProps = {}) {
  const { t } = useTranslation();
  const params = useParams({ strict: false }) as { project?: string };
  const username = useAuthStore((s) => s.username);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailMessage, setDetailMessage] = useState<ChatMessage | null>(null);
  const [mediaDetail, setMediaDetail] = useState<SpecMediaDetail | null>(null);
  const [composerInputFocused, setComposerInputFocused] = useState(false);
  const chat = useSuperChat({
    project: params.project,
    displayName: username || "AI anime",
  });
  useTaskCompletionNotifications({
    project: params.project,
    appendNotification: chat.appendNotification,
    t,
  });
  const { recording, toggleSpeech } = useSpeechInputController({
    onTranscript: setDraft,
  });
  const {
    clearFormatCheckDetails,
    formatCheckDetails,
    preparingSend,
    sendWithIngestAutomation,
  } = useIngestAutomationController({
    project: params.project,
    sendChatMessage: chat.send,
    t,
  });
  const {
    enqueueMessage,
    queuedMessages,
    removeQueuedMessage,
    selectQueuedMessage,
    selectQueuedMessageByOffset,
    selectedQueuedMessageId,
  } = useChatQueueController({
    busy: chat.busy,
    connected: chat.connected,
    preparingSend,
    project: params.project,
    sendMessage: sendWithIngestAutomation,
  });
  const {
    addFiles,
    attachments,
    clearAttachments,
    dragFileState,
    fileInputRef,
    handleComposerDragEnter,
    handleComposerDragLeave,
    handleComposerDragOver,
    handleComposerDrop,
    openFilePicker,
    removeAttachment,
  } = useComposerAttachmentsController(ENABLE_SUPERCHAT_FILE_UPLOAD);
  const isChatInitializing = !chat.historyReady && chat.messages.length === 0 && (chat.connecting || chat.connected);

  const hasSendableContent = draft.trim().length > 0 || attachments.length > 0;
  const canSend = hasSendableContent && chat.connected && !preparingSend;
  const composerWaiting = chat.busy && (!hasSendableContent || !chat.connected || preparingSend);
  const composerBeamActive =
    composerInputFocused
    && chat.connected
    && !chat.busy
    && !preparingSend
    && queuedMessages.length === 0;
  const composerShellRef = useComposerBorderBeam(composerBeamActive);
  const {
    activeMessageCount,
    currentStreamingAssistantId,
    deferStructuredRender,
    lastActiveMessageId,
    pinnedMessages,
    showWaitingIndicator,
    streamingAssistantId,
    streamTextAlreadyRendered,
    userMessageHistory,
    visibleMessages,
  } = useMemo(
    () => projectPanelMessages({
      activeTurnId: chat.activeTurnId,
      busy: chat.busy,
      composerWaiting,
      deletedIds: chat.deletedIds,
      messages: chat.messages,
      pinnedIds: chat.pinnedIds,
      search,
      showStructuredSourceWhileStreaming:
        chat.settings.showStructuredSourceWhileStreaming,
      showToolEvents: chat.settings.showToolEvents,
      streamText: chat.streamText,
    }),
    [
      chat.activeTurnId,
      chat.busy,
      chat.deletedIds,
      chat.messages,
      chat.pinnedIds,
      chat.settings.showStructuredSourceWhileStreaming,
      chat.settings.showToolEvents,
      chat.streamText,
      composerWaiting,
      search,
    ],
  );
  const {
    messageListRef,
    scrollRef,
    scrollToChatBottom,
    showScrollToBottom,
  } = useChatScrollController({
    activeMessageCount,
    busy: chat.busy,
    historyReady: chat.historyReady,
    lastActiveMessageId,
    messages: chat.messages,
    project: params.project,
    showWaitingIndicator,
    streamText: chat.streamText,
  });
  const {
    draftInputRef,
    resetHistorySelection,
    selectHistoryMessage,
    selectedHistoryMessageIndex,
  } = useComposerHistoryNavigation({
    draft,
    history: userMessageHistory,
    onDraftChange: setDraft,
    project: params.project,
  });

  const submit = () => {
    const hasCurrentContent = draft.trim().length > 0 || attachments.length > 0;
    if (!hasCurrentContent || preparingSend) return;
    if (!chat.connected) {
      toast.error(t("aiAssistant.waiting"));
      return;
    }
    resetHistorySelection();
    const text = draft.trim() || t("aiAssistant.attachmentOnlyPrompt");
    const queuedAttachments = attachments.map((attachment) => ({ ...attachment }));
    if (chat.busy) {
      enqueueMessage(text, queuedAttachments);
      setDraft("");
      clearAttachments();
      return;
    }
    void sendWithIngestAutomation(text, queuedAttachments).then((sent) => {
      if (!sent) return;
      setDraft("");
      clearAttachments();
    });
  };

  const isFreezoneLayout = variant === "freezone";

  return (
    <div className={cn("relative flex h-full min-h-0 overflow-hidden bg-background", isFreezoneLayout && "bg-transparent")}>
      {!isFreezoneLayout && (
        <HeaderControlPortal
          chat={chat}
          searchOpen={searchOpen}
          onToggleSearch={() => setSearchOpen((value) => !value)}
        />
      )}
      <section className="relative z-10 flex min-w-0 flex-1 flex-col">
        {isFreezoneLayout && (
          <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-1">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="truncate text-sm font-medium text-foreground">
                {t("freezone.chat.title")}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    chat.connected ? "bg-success" : chat.connecting ? "bg-warning" : "bg-muted-foreground",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">
                  {chat.connected
                    ? t("aiAssistant.connected")
                    : chat.connecting || chat.busy
                      ? t("aiAssistant.reconnecting")
                      : t("aiAssistant.disconnected")}
                </span>
              </div>
            </div>
            <ControlBar
              chat={chat}
              compact
              searchOpen={searchOpen}
              onToggleSearch={() => setSearchOpen((value) => !value)}
            />
            {onRequestClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onRequestClose}
                aria-label={t("freezone.chat.close")}
                title={t("freezone.chat.close")}
                className="text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        )}
        {chat.error && (
          <div className="border-b border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
            {chat.error}
          </div>
        )}

        {chat.approvals.map((approval) => (
          <ApprovalCard
            key={approval.id}
            approval={approval}
            onResolve={(decision) => chat.resolveApproval(approval, decision)}
          />
        ))}

        <PinnedPanel
          messages={pinnedMessages}
          onClear={chat.clearPinned}
          onTogglePin={chat.togglePin}
        />

        {searchOpen && (
          <SearchBar
            query={search}
            onChange={setSearch}
            onClose={() => setSearchOpen(false)}
          />
        )}

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            className={cn(
              "h-full overflow-y-auto px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              isFreezoneLayout && "px-2.5 py-3",
            )}
          >
            {isChatInitializing ? (
              <div className={cn("mx-auto flex h-full w-full max-w-[760px] items-center justify-center text-center", isFreezoneLayout && "max-w-none")}>
                <div className="max-w-72 text-sm text-muted-foreground">
                  <div className="mb-3 flex justify-center text-primary" aria-hidden="true">
                    <DotsIndicator />
                  </div>
                  <div className="mb-2 font-medium text-foreground">
                    {chat.connected ? t("aiAssistant.syncingHistoryTitle") : t("aiAssistant.connecting")}
                  </div>
                  <div className="text-xs leading-5">{t("aiAssistant.syncingHistoryDescription")}</div>
                </div>
              </div>
            ) : chat.messages.length === 0 && !chat.streamText && !showWaitingIndicator ? (
              <div className={cn("mx-auto flex h-full w-full max-w-[760px] items-center justify-center text-center", isFreezoneLayout && "max-w-none")}>
                <div className="max-w-64 text-sm text-muted-foreground">
                  <div className="mb-2 font-medium text-foreground">{t("aiAssistant.emptyTitle")}</div>
                  <div className="text-xs leading-5">{t("aiAssistant.emptyDescription")}</div>
                </div>
              </div>
            ) : (
              <div ref={messageListRef} className={cn("mx-auto w-full max-w-[760px] space-y-5", isFreezoneLayout && "max-w-none space-y-4")}>
                {visibleMessages.map((message) => (
                  <div
                    key={message.id}
                    data-message-id={message.id}
                    data-turn-id={message.role === "user" ? message.id : undefined}
                  >
                    <MessageBubble
                      message={message}
                      variant={variant}
                      onOpenDetail={setDetailMessage}
                      onOpenMedia={setMediaDetail}
                      pinned={chat.pinnedIds.has(message.id)}
                      onDelete={chat.deleteMessage}
                      onTogglePin={chat.togglePin}
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
                {chat.streamText && !streamTextAlreadyRendered && (
                  <MessageBubble
                    message={{
                      id: "streaming",
                      role: "assistant",
                      text: chat.streamText,
                      timestamp: Date.now(),
                    }}
                    variant={variant}
                    onOpenDetail={setDetailMessage}
                    onOpenMedia={setMediaDetail}
                    pinned={false}
                    onDelete={() => undefined}
                    onTogglePin={() => undefined}
                    deferStructuredRender={deferStructuredRender}
                    streaming={chat.busy}
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
              onClick={() => scrollToChatBottom("auto")}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          )}
          {!isFreezoneLayout && (
            <ChatTimeline messages={visibleMessages} scrollRef={scrollRef} />
          )}
        </div>

        <ChatComposer
          attachments={attachments}
          busy={chat.busy}
          canSend={canSend}
          connected={chat.connected}
          draft={draft}
          draftInputRef={draftInputRef}
          dragFileState={dragFileState}
          fileInputRef={fileInputRef}
          fileUploadEnabled={ENABLE_SUPERCHAT_FILE_UPLOAD}
          isFreezoneLayout={isFreezoneLayout}
          queuedMessages={queuedMessages}
          recording={recording}
          selectedHistoryMessageIndex={selectedHistoryMessageIndex}
          selectedQueuedMessageId={selectedQueuedMessageId}
          shellRef={composerShellRef}
          showWaitingIndicator={showWaitingIndicator}
          onAbort={chat.abort}
          onAddFiles={addFiles}
          onAttachmentRemove={removeAttachment}
          onDragEnter={handleComposerDragEnter}
          onDragLeave={handleComposerDragLeave}
          onDragOver={handleComposerDragOver}
          onDraftChange={setDraft}
          onDraftFocusChange={setComposerInputFocused}
          onDropFiles={handleComposerDrop}
          onHistorySelect={selectHistoryMessage}
          onOpenFilePicker={openFilePicker}
          onQueueOffset={selectQueuedMessageByOffset}
          onQueueRemove={removeQueuedMessage}
          onQueueSelect={selectQueuedMessage}
          onResetHistorySelection={resetHistorySelection}
          onSubmit={submit}
          onToggleSpeech={toggleSpeech}
        />
      </section>
      <MessageDetailPanel
        message={detailMessage}
        onClose={() => setDetailMessage(null)}
        onOpenMedia={setMediaDetail}
      />
      <SpecMediaDetailModal
        detail={mediaDetail}
        onClose={() => setMediaDetail(null)}
        onOpenMedia={setMediaDetail}
      />
      <FormatCheckDetailsDialog
        formatCheck={formatCheckDetails?.formatCheck ?? null}
        filename={formatCheckDetails?.filename}
        open={Boolean(formatCheckDetails)}
        onOpenChange={(next) => {
          if (!next) clearFormatCheckDetails();
        }}
      />
      <img
        src="/images/bg-chat-buttom.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 w-full max-w-none select-none"
      />
    </div>
  );
}
