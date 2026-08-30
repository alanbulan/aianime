// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";

import { projectPanelMessages } from "@/modules/ai_assistant/application/panelMessageProjection";
import { useChatQueueController } from "@/modules/ai_assistant/application/useChatQueueController";
import { useComposerSubmitController } from "@/modules/ai_assistant/application/useComposerSubmitController";
import {
  useActiveConversation,
  useChatSession,
  useIngestAutomationController,
} from "@/modules/ai_assistant/composition";
import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import { ChatConversationDrawer } from "@/modules/ai_assistant/presentation/ChatConversationDrawer";
import { ChatPanelActions } from "@/modules/ai_assistant/presentation/ChatControlBar";
import { SuperChatPanelView } from "@/modules/ai_assistant/presentation/SuperChatPanelView";
import type { SpecMediaDetail } from "@/modules/ai_assistant/presentation/SpecMediaModals";
import { useChatScrollController } from "@/modules/ai_assistant/presentation/useChatScrollController";
import { useComposerAttachmentsController } from "@/modules/ai_assistant/presentation/useComposerAttachmentsController";
import { useComposerBorderBeam } from "@/modules/ai_assistant/presentation/useComposerBorderBeam";
import { useComposerHistoryNavigation } from "@/modules/ai_assistant/presentation/useComposerHistoryNavigation";
import { useSpeechInputController } from "@/modules/ai_assistant/presentation/useSpeechInputController";
import { useTaskCompletionNotifications } from "@/modules/ai_assistant/presentation/useTaskCompletionNotifications";
import { useAuthStore } from "@/modules/identity_access/public";

const ENABLE_SUPERCHAT_FILE_UPLOAD = true;

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
  const username = useAuthStore((state) => state.username);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailMessage, setDetailMessage] = useState<ChatMessage | null>(null);
  const [mediaDetail, setMediaDetail] = useState<SpecMediaDetail | null>(null);
  const [composerInputFocused, setComposerInputFocused] = useState(false);
  const {
    conversationScopeKey,
    conversationId,
    selectConversation,
  } = useActiveConversation({
    username,
    project: params.project,
  });
  const [conversationDrawerOpen, setConversationDrawerOpen] = useState(false);

  useEffect(() => {
    setConversationDrawerOpen(false);
  }, [conversationScopeKey]);

  const chat = useChatSession({
    project: params.project,
    conversationId,
    displayName: username || "AI anime",
  });
  useTaskCompletionNotifications({
    project: params.project,
    appendNotification: chat.appendNotification,
    t,
  });
  const { recording, transcribing, toggleSpeech } = useSpeechInputController({
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
  const composerWaiting =
    chat.busy && (!hasSendableContent || !chat.connected || preparingSend);
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
    <SuperChatPanelView
      isFreezoneLayout={isFreezoneLayout}
      conversationDrawer={(
        <ChatConversationDrawer
          activeConversationId={conversationId}
          conversations={chat.conversations}
          disabled={chat.busy}
          open={conversationDrawerOpen}
          onCreate={() => {
            const nextId = `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            selectConversation(nextId);
            setConversationDrawerOpen(false);
          }}
          onDelete={(targetConversationId) => {
            if (chat.deleteConversation(targetConversationId)) {
              if (targetConversationId === conversationId) {
                selectConversation("main");
              }
              setConversationDrawerOpen(false);
            }
          }}
          onOpenChange={setConversationDrawerOpen}
          onSelect={(nextConversationId) => {
            selectConversation(nextConversationId);
            setConversationDrawerOpen(false);
          }}
        />
      )}
      header={{
        chat,
        onRequestClose,
      }}
      contextViews={{
        approvals: chat.approvals,
        decisions: chat.decisions,
        error: chat.error,
        pinnedMessages,
        searchOpen,
        searchQuery: search,
        onClearPinned: chat.clearPinned,
        onResolveApproval: chat.resolveApproval,
        onResolveDecision: chat.resolveDecision,
        onSearchChange: setSearch,
        onSearchClose: () => setSearchOpen(false),
        onTogglePin: chat.togglePin,
        submittingDecisionIds: chat.submittingDecisionIds,
      }}
      messageArea={{
        busy: chat.busy,
        connected: chat.connected,
        connecting: chat.connecting,
        currentStreamingAssistantId,
        deferStructuredRender,
        historyReady: chat.historyReady,
        messageListRef,
        excludedIds: chat.deletedIds,
        pinnedIds: chat.pinnedIds,
        scrollRef,
        showScrollToBottom,
        showWaitingIndicator,
        streamText: chat.streamText,
        streamTextAlreadyRendered,
        streamingAssistantId,
        totalMessageCount: chat.messages.length,
        variant,
        visibleMessages,
        onDeleteMessage: chat.deleteMessage,
        onOpenDetail: setDetailMessage,
        onOpenMedia: setMediaDetail,
        onScrollToBottom: scrollToChatBottom,
        onTogglePin: chat.togglePin,
      }}
      composer={{
        activeModel: chat.activeModel,
        activeReasoningEffort: chat.activeReasoningEffort,
        attachments,
        assistantActions: (
          <ChatPanelActions
            chat={chat}
            searchOpen={searchOpen}
            onToggleSessions={() => {
              chat.requestHistory();
              setConversationDrawerOpen(true);
            }}
            onToggleSearch={() => setSearchOpen((value) => !value)}
          />
        ),
        busy: chat.busy,
        canSend,
        connected: chat.connected,
        draft,
        draftInputRef,
        dragFileState,
        fileInputRef,
        fileUploadEnabled: ENABLE_SUPERCHAT_FILE_UPLOAD,
        queuedMessages,
        models: chat.models,
        modelsLoading: chat.modelsLoading,
        slashCommands: chat.slashCommands,
        recording,
        transcribing,
        selectedHistoryMessageIndex,
        selectedQueuedMessageId,
        shellRef: composerShellRef,
        showWaitingIndicator,
        onAbort: chat.abort,
        onAddFiles: addFiles,
        onAttachmentRemove: removeAttachment,
        onDragEnter: handleComposerDragEnter,
        onDragLeave: handleComposerDragLeave,
        onDragOver: handleComposerDragOver,
        onDraftChange: setDraft,
        onDraftFocusChange: setComposerInputFocused,
        onDropFiles: handleComposerDrop,
        onRunSlashCommand: chat.runSlashCommand,
        onHistorySelect: selectHistoryMessage,
        onOpenFilePicker: openFilePicker,
        onQueueOffset: selectQueuedMessageByOffset,
        onQueueRemove: removeQueuedMessage,
        onQueueSelect: selectQueuedMessage,
        onRefreshModels: () => {
          void chat.refreshModels();
        },
        onResetHistorySelection: resetHistorySelection,
        onSubmit: submit,
        onSwitchModel: chat.switchModel,
        onSwitchReasoningEffort: chat.switchReasoningEffort,
        onToggleSpeech: toggleSpeech,
      }}
      detailOverlays={{
        detailMessage,
        formatCheck: formatCheckDetails?.formatCheck ?? null,
        formatCheckFilename: formatCheckDetails?.filename,
        formatCheckOpen: Boolean(formatCheckDetails),
        mediaDetail,
        onClearFormatCheckDetails: clearFormatCheckDetails,
        onCloseDetail: () => setDetailMessage(null),
        onCloseMedia: () => setMediaDetail(null),
        onOpenMedia: setMediaDetail,
      }}
    />
  );
}
