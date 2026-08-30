// Copyright (c) 2026 AI anime
export {
  isChatScope,
  scopeForProject,
  scopeMatches,
  scopeSessionKey,
} from "@/modules/ai_assistant/domain/scope";
export {
  activeTurnIsPending,
  currentTurnIsLive,
} from "@/modules/ai_assistant/domain/activeTurn";
export {
  assistantCompletionTextEnd,
  errorTextRanges,
  isAssistantCompletionNotice,
  isAssistantErrorReply,
  isHistoricalToolMessage,
  isToolMessage,
  normalizeMessageText,
} from "@/modules/ai_assistant/domain/messagePresentationRules";
export {
  buildLocalUserMessage,
  extractMessageText,
  normalizeMessage,
} from "@/modules/ai_assistant/domain/message";
export {
  isAllowedChatDragItem,
  isAllowedChatUpload,
  isAllowedScriptDragItem,
  isAllowedScriptUpload,
} from "@/modules/ai_assistant/domain/ingestAutomation";
export {
  extractStructuredBlocks,
  hasStructuredContent,
  isUiSpec,
  looksLikeStructuredRenderText,
} from "@/modules/ai_assistant/domain/structuredContent";
export {
  QIUQIU_EMOTIONS,
  qiuQiuEmotionName,
  resolveQiuQiuEmotion,
} from "@/modules/ai_assistant/domain/qiuQiuEmotion";
export type {
  QiuQiuEmotionId,
} from "@/modules/ai_assistant/domain/qiuQiuEmotion";
export type {
  StructuredBlock,
  UiSpec,
} from "@/modules/ai_assistant/domain/structuredContent";
export {
  extractKeyframeVideoPreviewItems,
  extractPendingKeyframeVideoItem,
  extractUnifiedMediaItems,
} from "@/modules/ai_assistant/domain/specMediaProjection";
export type {
  KeyframeVideoPreviewItem,
  UnifiedMediaItem,
} from "@/modules/ai_assistant/domain/specMediaProjection";
export { projectPanelMessages } from "@/modules/ai_assistant/application/panelMessageProjection";
export {
  mergeHistorySnapshot,
  normalizeHistory,
  sortMessages,
  turnCompletedInHistory,
} from "@/modules/ai_assistant/application/messageTimeline";
export {
  appendToolMessage,
  shouldPreserveToolMessage,
  upsertAssistantMessage,
  upsertServerAssistantMessage,
  upsertToolMessage,
} from "@/modules/ai_assistant/application/messageProjection";
export {
  useSuperChatFrameController,
} from "@/modules/ai_assistant/application/useFrameController";
export {
  useComposerSubmitController,
} from "@/modules/ai_assistant/application/useComposerSubmitController";
export {
  useChatQueueController,
} from "@/modules/ai_assistant/application/useChatQueueController";
export {
  useChatSession,
  useIngestAutomationController,
} from "@/modules/ai_assistant/composition";
export {
  clearActiveTurn,
  loadPendingActiveTurn,
  saveActiveTurn,
} from "@/modules/ai_assistant/infrastructure/activeTurnStorage";
export type {
  ActiveTurnSnapshot,
} from "@/modules/ai_assistant/infrastructure/activeTurnStorage";
export {
  loadCachedMessages,
  pruneOldMessageCaches,
  sanitizeMessagesForCache,
  saveCachedMessages,
} from "@/modules/ai_assistant/infrastructure/messageCache";
export {
  loadScopedMessageIds,
  loadSuperChatSettings,
  saveScopedMessageIds,
  saveSuperChatSettings,
} from "@/modules/ai_assistant/infrastructure/preferencesStorage";
export {
  appendChatNotification,
  cancelChatBestEffort,
  resolveChatDecision,
  runChatSlashCommand,
  setChatMessageContextState,
} from "@/modules/ai_assistant/infrastructure/chatCommands";
export {
  DEFAULT_CHAT_SLASH_COMMANDS,
  filterSlashCommands,
  normalizeSlashCommands,
  slashCommandQuery,
} from "@/modules/ai_assistant/domain/slashCommand";
export {
  createSuperChatSocketSession,
} from "@/modules/ai_assistant/infrastructure/socketSession";
export type {
  SuperChatSocketSession,
} from "@/modules/ai_assistant/infrastructure/socketSession";
export {
  calculateTimelineContextDelta,
  calculateTimelineTurnScrollTop,
  TIMELINE_ACTIVE_VIEWPORT_RATIO,
} from "@/modules/ai_assistant/presentation/timelineScroll";
export {
  useComposerAttachmentsController,
} from "@/modules/ai_assistant/presentation/useComposerAttachmentsController";
export {
  useComposerBorderBeam,
} from "@/modules/ai_assistant/presentation/useComposerBorderBeam";
export {
  useComposerHistoryNavigation,
} from "@/modules/ai_assistant/presentation/useComposerHistoryNavigation";
export {
  useChatScrollController,
} from "@/modules/ai_assistant/presentation/useChatScrollController";
export {
  useSpeechInputController,
} from "@/modules/ai_assistant/presentation/useSpeechInputController";
export {
  buildChatTaskLabel,
} from "@/modules/ai_assistant/presentation/taskNotificationLabel";
export {
  useTaskCompletionNotifications,
} from "@/modules/ai_assistant/presentation/useTaskCompletionNotifications";
export {
  ChatPanelHeader,
} from "@/modules/ai_assistant/presentation/ChatPanelHeader";
export type {
  ChatPanelHeaderProps,
} from "@/modules/ai_assistant/presentation/ChatPanelHeader";
export {
  ApprovalCard,
} from "@/modules/ai_assistant/presentation/ApprovalCard";
export {
  DecisionCard,
} from "@/modules/ai_assistant/presentation/DecisionCard";
export {
  SearchBar,
} from "@/modules/ai_assistant/presentation/SearchBar";
export {
  PinnedPanel,
} from "@/modules/ai_assistant/presentation/PinnedPanel";
export {
  JsonNode,
} from "@/modules/ai_assistant/presentation/StructuredJsonView";
export {
  ComposerWaitingStatus,
} from "@/modules/ai_assistant/presentation/ComposerWaitingStatus";
export {
  QueuedMessagesPanel,
} from "@/modules/ai_assistant/presentation/QueuedMessagesPanel";
export {
  ChatPanelContextViews,
} from "@/modules/ai_assistant/presentation/ChatPanelContextViews";
export type {
  ChatPanelContextViewsProps,
} from "@/modules/ai_assistant/presentation/ChatPanelContextViews";
export {
  ChatComposer,
} from "@/modules/ai_assistant/presentation/ChatComposer";
export type {
  ChatComposerProps,
} from "@/modules/ai_assistant/presentation/ChatComposer";
export {
  QiuQiuAvatar,
} from "@/modules/ai_assistant/presentation/QiuQiuAvatar";
export {
  SpecMediaDetailModal,
  VideoDetailModal,
} from "@/modules/ai_assistant/presentation/SpecMediaModals";
export type {
  SpecMediaDetail,
} from "@/modules/ai_assistant/presentation/SpecMediaModals";
export {
  UiSpecRenderer,
} from "@/modules/ai_assistant/presentation/SpecMediaGallery";
export {
  DotsIndicator,
  MessageBubble,
  StructuredRenderer,
} from "@/modules/ai_assistant/presentation/ChatMessageView";
export {
  MessageDetailPanel,
} from "@/modules/ai_assistant/presentation/MessageDetailPanel";
export {
  ChatTimeline,
} from "@/modules/ai_assistant/presentation/ChatTimeline";
export {
  ChatMessageArea,
} from "@/modules/ai_assistant/presentation/ChatMessageArea";
export type {
  ChatMessageAreaProps,
} from "@/modules/ai_assistant/presentation/ChatMessageArea";
export {
  ChatPanelDetailOverlays,
} from "@/modules/ai_assistant/presentation/ChatPanelDetailOverlays";
export type {
  ChatPanelDetailOverlaysProps,
} from "@/modules/ai_assistant/presentation/ChatPanelDetailOverlays";
export {
  SuperChatPanelView,
} from "@/modules/ai_assistant/presentation/SuperChatPanelView";
export type {
  SuperChatPanelViewProps,
} from "@/modules/ai_assistant/presentation/SuperChatPanelView";
export {
  SuperChatPanel,
} from "@/modules/ai_assistant/presentation/SuperChatPanel";
export type {
  ApprovalRequest,
  ChatAttachment,
  ChatMessage,
  ChatRole,
  ChatScope,
  ClientFrame,
  DecisionAnswer,
  DecisionOption,
  DecisionQuestion,
  DecisionRequest,
  ModelEntry,
  RelayInstanceInfo,
  ServerFrame,
  SessionControlCommand,
  SuperChatSettings,
} from "@/modules/ai_assistant/domain/contracts";
