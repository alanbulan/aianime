// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";

import { useAuthStore } from "@/modules/identity_access/public";
import { cn } from "@/lib/utils";
import { useSuperChat } from "@/features/superchat/use-superchat";
import { ChatPanelHeader } from "@/features/superchat/chat-panel-header";
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
import { useComposerSubmitController } from "@/features/superchat/use-composer-submit-controller";
import { ChatComposer } from "@/features/superchat/chat-composer";
import { ChatMessageArea } from "@/features/superchat/chat-message-area";
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
  const submit = useComposerSubmitController({
    attachments,
    busy: chat.busy,
    clearAttachments,
    connected: chat.connected,
    draft,
    enqueueMessage,
    onDraftChange: setDraft,
    preparingSend,
    resetHistorySelection,
    sendMessage: sendWithIngestAutomation,
    t,
  });

  const isFreezoneLayout = variant === "freezone";

  return (
    <div className={cn("relative flex h-full min-h-0 overflow-hidden bg-background", isFreezoneLayout && "bg-transparent")}>
      <section className="relative z-10 flex min-w-0 flex-1 flex-col">
        <ChatPanelHeader
          chat={chat}
          isFreezoneLayout={isFreezoneLayout}
          onRequestClose={onRequestClose}
          searchOpen={searchOpen}
          onToggleSearch={() => setSearchOpen((value) => !value)}
        />
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

        <ChatMessageArea
          busy={chat.busy}
          connected={chat.connected}
          connecting={chat.connecting}
          currentStreamingAssistantId={currentStreamingAssistantId}
          deferStructuredRender={deferStructuredRender}
          historyReady={chat.historyReady}
          isFreezoneLayout={isFreezoneLayout}
          messageListRef={messageListRef}
          pinnedIds={chat.pinnedIds}
          scrollRef={scrollRef}
          showScrollToBottom={showScrollToBottom}
          showWaitingIndicator={showWaitingIndicator}
          streamText={chat.streamText}
          streamTextAlreadyRendered={streamTextAlreadyRendered}
          streamingAssistantId={streamingAssistantId}
          totalMessageCount={chat.messages.length}
          variant={variant}
          visibleMessages={visibleMessages}
          onDeleteMessage={chat.deleteMessage}
          onOpenDetail={setDetailMessage}
          onOpenMedia={setMediaDetail}
          onScrollToBottom={scrollToChatBottom}
          onTogglePin={chat.togglePin}
        />

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
