// Copyright (c) 2026 AI anime
import {
  ArrowDown,
  ArrowUp,
  File as FileIcon,
  Image,
  Mic,
  MicOff,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/modules/identity_access/public";
import { cn } from "@/lib/utils";
import { useSuperChat } from "@/features/superchat/use-superchat";
import { ComposerWaitingStatus } from "@/features/superchat/composer-waiting-status";
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
import {
  isAllowedScriptDragItem,
  isAllowedScriptUpload,
} from "@/features/superchat/ingest-automation-domain";
import { useIngestAutomationController } from "@/features/superchat/use-ingest-automation-controller";
import { useSpeechInputController } from "@/features/superchat/use-speech-input-controller";
import { useTaskCompletionNotifications } from "@/features/superchat/use-task-completion-notifications";
import { useChatScrollController } from "@/features/superchat/use-chat-scroll-controller";
import { useChatQueueController } from "@/features/superchat/use-chat-queue-controller";
import { useComposerBorderBeam } from "@/features/superchat/use-composer-border-beam";
import {
  SpecMediaDetailModal,
  type SpecMediaDetail,
} from "@/features/superchat/spec-media-modals";
import { projectPanelMessages } from "@/features/superchat/panel-message-projection";
import type { ChatMessage } from "@/features/superchat/types";
import type { ChatAttachment } from "@/features/superchat/types";
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
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [selectedHistoryMessageIndex, setSelectedHistoryMessageIndex] = useState<number | null>(null);
  const [composerInputFocused, setComposerInputFocused] = useState(false);
  const [dragFileState, setDragFileState] = useState<"valid" | "invalid" | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const restoreDraftFocusRef = useRef(false);
  const dragDepthRef = useRef(0);
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

  useEffect(() => {
    setSelectedHistoryMessageIndex(null);
  }, [params.project]);

  useLayoutEffect(() => {
    if (!restoreDraftFocusRef.current) return;
    restoreDraftFocusRef.current = false;
    const textarea = draftInputRef.current;
    if (!textarea || textarea.disabled) return;
    if (document.activeElement === textarea) return;
    textarea.focus({ preventScroll: true });
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [draft]);

  const submit = () => {
    const hasCurrentContent = draft.trim().length > 0 || attachments.length > 0;
    if (!hasCurrentContent || preparingSend) return;
    if (!chat.connected) {
      toast.error(t("aiAssistant.waiting"));
      return;
    }
    setSelectedHistoryMessageIndex(null);
    const text = draft.trim() || t("aiAssistant.attachmentOnlyPrompt");
    const queuedAttachments = attachments.map((attachment) => ({ ...attachment }));
    if (chat.busy) {
      enqueueMessage(text, queuedAttachments);
      setDraft("");
      setAttachments([]);
      return;
    }
    void sendWithIngestAutomation(text, queuedAttachments).then((sent) => {
      if (!sent) return;
      setDraft("");
      setAttachments([]);
    });
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      target !== draftInputRef.current &&
      (target.tagName === "BUTTON" || target.tagName === "INPUT" || target.getAttribute("role") === "button")
    ) {
      return;
    }
    event.preventDefault();
    submit();
  };

  const selectHistoryMessage = (direction: "older" | "newer") => {
    if (userMessageHistory.length === 0) return false;
    if (direction === "older") {
      const nextIndex =
        selectedHistoryMessageIndex === null
          ? userMessageHistory.length - 1
          : Math.max(0, selectedHistoryMessageIndex - 1);
      setSelectedHistoryMessageIndex(nextIndex);
      setDraft(userMessageHistory[nextIndex]);
      restoreDraftFocusRef.current = true;
      return true;
    }
    if (selectedHistoryMessageIndex === null) return false;
    if (selectedHistoryMessageIndex >= userMessageHistory.length - 1) {
      setSelectedHistoryMessageIndex(null);
      setDraft("");
      restoreDraftFocusRef.current = true;
      return true;
    }
    const nextIndex = selectedHistoryMessageIndex + 1;
    setSelectedHistoryMessageIndex(nextIndex);
    setDraft(userMessageHistory[nextIndex]);
    restoreDraftFocusRef.current = true;
    return true;
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!isAllowedScriptUpload(file)) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const dataUrl = String(reader.result || "");
        setAttachments((current) => [
          ...current,
          {
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: file.type.startsWith("image/") ? "image" : "file",
            mimeType: file.type || "application/octet-stream",
            fileName: file.name,
            fileSize: file.size,
            content: dataUrl,
          },
        ]);
      });
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus({ preventScroll: true });
    });
  };

  const eventHasFiles = (event: ReactDragEvent<HTMLElement>): boolean =>
    Array.from(event.dataTransfer.types).includes("Files");

  const resolveDragFileState = (event: ReactDragEvent<HTMLElement>): "valid" | "invalid" => {
    const items = Array.from(event.dataTransfer.items).filter((item) => item.kind === "file");
    if (items.length === 0) return "valid";
    return items.every((item) => {
      const file = item.getAsFile();
      if (file) return isAllowedScriptDragItem(file);
      return isAllowedScriptDragItem({ type: item.type });
    })
      ? "valid"
      : "invalid";
  };

  const handleComposerDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!ENABLE_SUPERCHAT_FILE_UPLOAD) return;
    if (!eventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setDragFileState(resolveDragFileState(event));
  };

  const handleComposerDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!ENABLE_SUPERCHAT_FILE_UPLOAD) return;
    if (!eventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const nextState = resolveDragFileState(event);
    setDragFileState(nextState);
    event.dataTransfer.dropEffect = nextState === "valid" ? "copy" : "none";
  };

  const handleComposerDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!ENABLE_SUPERCHAT_FILE_UPLOAD) return;
    if (!eventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragFileState(null);
  };

  const handleComposerDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!ENABLE_SUPERCHAT_FILE_UPLOAD) return;
    if (!eventHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragFileState(null);
    addFiles(event.dataTransfer.files);
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

        <div className={cn("sticky bottom-0 z-40 shrink-0 bg-transparent p-3", isFreezoneLayout && "px-4 pb-4 pt-1")}>
          <div className={cn("relative mx-auto mb-2.5 h-7 w-full max-w-[760px]", isFreezoneLayout && "max-w-none")}>
            <ComposerWaitingStatus
              label={t("aiAssistant.waitingResponse")}
              visible={showWaitingIndicator}
            />
          </div>
          <div
            ref={composerShellRef}
            className={cn(
              "relative mx-auto w-full max-w-[760px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
              dragFileState === "valid" && "border-primary/70 bg-primary/5",
              dragFileState === "invalid" && "border-destructive/80 bg-destructive/10",
              isFreezoneLayout && "max-w-none rounded-xl bg-card",
            )}
            onDragEnter={handleComposerDragEnter}
            onDragOver={handleComposerDragOver}
            onDragLeave={handleComposerDragLeave}
            onDrop={handleComposerDrop}
            onKeyDown={handleComposerKeyDown}
          >
            {ENABLE_SUPERCHAT_FILE_UPLOAD && (
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".txt,.md,.doc,.docx"
                onChange={(event) => addFiles(event.target.files)}
              />
            )}
            {ENABLE_SUPERCHAT_FILE_UPLOAD && dragFileState && (
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/72 text-sm font-medium backdrop-blur-sm",
                  dragFileState === "invalid" ? "text-destructive" : "text-foreground",
                )}
              >
                {dragFileState === "invalid" ? t("aiAssistant.unsupportedDropFiles") : t("aiAssistant.dropFiles")}
              </div>
            )}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                {attachments.map((attachment) => (
                  <span
                    key={attachment.id}
                    className="inline-flex max-w-48 items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs"
                  >
                    {attachment.mimeType?.startsWith("image/") ? <Image className="size-3.5" /> : <FileIcon className="size-3.5" />}
                    <span className="truncate">{attachment.fileName}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={t("aiAssistant.removeAttachment")}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {queuedMessages.length > 0 && (
              <div className="border-t border-border px-4 py-2">
                <div className="mb-1.5 text-xs font-normal text-muted-foreground">
                  {t("aiAssistant.queuedCount", { count: queuedMessages.length })}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {queuedMessages.map((message) => {
                    const showSelectedState = queuedMessages.length > 1 && selectedQueuedMessageId === message.id;
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "inline-flex max-w-full items-center overflow-hidden rounded-[6px] border border-border bg-muted text-xs text-foreground/70 transition-colors hover:bg-accent focus-within:border-primary/45",
                          showSelectedState && "border-primary/35 bg-primary/[0.07] text-foreground/90 focus-within:border-primary/45",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => selectQueuedMessage(message.id)}
                          className="flex min-w-0 items-center gap-1.5 px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
                          aria-label={t("aiAssistant.selectQueuedMessage")}
                          aria-pressed={showSelectedState}
                        >
                          <span className="max-w-56 truncate">{message.text}</span>
                          {message.attachments.length > 0 && (
                            <span className="shrink-0 text-muted-foreground">
                              {t("aiAssistant.queuedAttachments", { count: message.attachments.length })}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeQueuedMessage(message.id)}
                          className="mr-0.5 flex size-5 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-label={t("aiAssistant.removeQueuedMessage")}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <Textarea
              ref={draftInputRef}
              value={draft}
              onChange={(event) => {
                setSelectedHistoryMessageIndex(null);
                setDraft(event.target.value);
              }}
              onFocus={() => setComposerInputFocused(true)}
              onBlur={() => setComposerInputFocused(false)}
              onKeyDown={(event) => {
                if (
                  queuedMessages.length > 0
                  && draft.trim().length === 0
                  && (event.key === "ArrowUp" || event.key === "ArrowDown")
                ) {
                  event.preventDefault();
                  selectQueuedMessageByOffset(event.key === "ArrowUp" ? -1 : 1);
                  return;
                }
                if (
                  event.key === "ArrowUp"
                  && queuedMessages.length === 0
                  && (draft.trim().length === 0 || selectedHistoryMessageIndex !== null)
                ) {
                  event.preventDefault();
                  selectHistoryMessage("older");
                  return;
                }
                if (
                  event.key === "ArrowDown"
                  && queuedMessages.length === 0
                  && selectedHistoryMessageIndex !== null
                ) {
                  event.preventDefault();
                  selectHistoryMessage("newer");
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              dir="auto"
              placeholder={t("aiAssistant.placeholder")}
              className={cn(
                "max-h-[220px] min-h-14 resize-none border-0 bg-transparent px-5 py-4 text-base shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 dark:bg-transparent",
                isFreezoneLayout && "min-h-11 px-3.5 py-3 text-sm",
              )}
              rows={1}
            />
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-1">
                {ENABLE_SUPERCHAT_FILE_UPLOAD && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={!chat.connected}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label={t("aiAssistant.attach")}
                    title={t("aiAssistant.attach")}
                  >
                    <Plus className="size-4" />
                  </Button>
                )}
              </div>
              <div className="flex shrink-0 items-end gap-1.5">
                {recording && (
                  <div className="mr-1 flex items-center gap-1.5 text-sm text-primary">
                    <span className="size-2 animate-pulse rounded-full bg-primary" />
                    <span>{t("aiAssistant.listening")}</span>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground", recording && "text-primary")}
                  disabled={!chat.connected}
                  onClick={toggleSpeech}
                  aria-label={recording ? t("aiAssistant.stopVoice") : t("aiAssistant.voiceInput")}
                  title={recording ? t("aiAssistant.stopVoice") : t("aiAssistant.voiceInput")}
                >
                  {recording ? <MicOff className="size-4.5" /> : <Mic className="size-4.5" />}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  className={cn(
                    "size-8 rounded-full shadow-none disabled:bg-muted disabled:text-muted-foreground/45",
                    chat.busy
                      ? "bg-muted text-foreground hover:bg-accent"
                      : "bg-foreground text-background hover:bg-foreground/90",
                  )}
                  disabled={chat.busy ? false : !canSend}
                  onClick={chat.busy ? chat.abort : submit}
                  aria-label={chat.busy ? t("aiAssistant.stop") : t("aiAssistant.send")}
                  title={chat.busy ? t("aiAssistant.stop") : t("aiAssistant.send")}
                >
                  {chat.busy ? (
                    <span className="size-2.5 rounded-[2.5px] bg-current" aria-hidden />
                  ) : (
                    <ArrowUp className="size-[18px]" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          {!isFreezoneLayout && (
            <p className="mx-auto mt-[13px] w-full max-w-[680px] text-center text-[11px] leading-4 text-muted-foreground/80">
              {t("aiAssistant.disclaimer")}
            </p>
          )}
        </div>
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
