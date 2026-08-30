// Copyright (c) 2026 AI anime
import { isToolMessage } from "@/modules/ai_assistant/domain/messagePresentationRules";
import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";

type PanelMessageProjectionOptions = {
  activeTurnId: string | null;
  busy: boolean;
  composerWaiting: boolean;
  deletedIds: ReadonlySet<string>;
  messages: ChatMessage[];
  pinnedIds: ReadonlySet<string>;
  search: string;
  showStructuredSourceWhileStreaming: boolean;
  showToolEvents: boolean;
  streamText: string;
};

export function projectPanelMessages({
  activeTurnId,
  busy,
  composerWaiting,
  deletedIds,
  messages,
  pinnedIds,
  search,
  showStructuredSourceWhileStreaming,
  showToolEvents,
  streamText,
}: PanelMessageProjectionOptions) {
  const activeMessages = messages.filter(
    (message) =>
      showToolEvents || !isToolMessage(message),
  );
  const contextMessages = activeMessages.filter(
    (message) => !deletedIds.has(message.id),
  );
  const userMessageHistory = contextMessages
    .filter(
      (message) => message.role === "user" && message.text.trim().length > 0,
    )
    .map((message) => message.text);
  const pinnedMessages = contextMessages.filter((message) =>
    pinnedIds.has(message.id),
  );
  const searchQuery = search.trim().toLowerCase();
  const visibleMessages = searchQuery
    ? activeMessages.filter((message) =>
        message.text.toLowerCase().includes(searchQuery),
      )
    : activeMessages;
  const deferStructuredRender =
    busy && !showStructuredSourceWhileStreaming;
  const streamTextAlreadyRendered =
    Boolean(streamText)
    && visibleMessages.some(
      (message) =>
        message.role === "assistant" && message.text === streamText,
    );
  const lastConversationalMessage = [...contextMessages]
    .reverse()
    .find(
      (message) => message.role === "user" || message.role === "assistant",
    );
  const lastUserMessage = [...contextMessages]
    .reverse()
    .find(
      (message) =>
        message.role === "user" && message.text.trim().length > 0,
    );
  const activeTurnUserMessage = activeTurnId
    ? contextMessages.find(
        (message) =>
          message.role === "user"
          && message.turnId === activeTurnId
          && message.text.trim().length > 0,
      )
    : null;
  const activeTurnHasAssistantReply = Boolean(
    activeTurnId
    && contextMessages.some(
      (message) =>
        message.role === "assistant"
        && message.turnId === activeTurnId
        && message.text.trim().length > 0,
    ),
  );
  const lastUserHasAssistantReply = Boolean(
    lastUserMessage?.turnId
    && contextMessages.some(
      (message) =>
        message.role === "assistant"
        && message.turnId === lastUserMessage.turnId
        && message.text.trim().length > 0,
    ),
  );
  const currentStreamingAssistantId =
    deferStructuredRender && lastConversationalMessage?.role === "assistant"
      ? lastConversationalMessage.id
      : null;
  const streamingAssistantId =
    busy && lastConversationalMessage?.role === "assistant"
      ? lastConversationalMessage.id
      : null;
  const showWaitingIndicator =
    busy
    && !streamText.trim()
    && (
      composerWaiting
      || (
        activeTurnUserMessage
          ? !activeTurnHasAssistantReply
          : (!lastUserMessage || !lastUserHasAssistantReply)
      )
    );

  return {
    activeMessageCount: activeMessages.length,
    activeMessages,
    currentStreamingAssistantId,
    deferStructuredRender,
    lastActiveMessageId:
      activeMessages[activeMessages.length - 1]?.id ?? "",
    pinnedMessages,
    showWaitingIndicator,
    streamingAssistantId,
    streamTextAlreadyRendered,
    userMessageHistory,
    visibleMessages,
  };
}
