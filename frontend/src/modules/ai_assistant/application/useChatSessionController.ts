// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { activeTurnIsPending } from "@/modules/ai_assistant/domain/activeTurn";
import type {
  ApprovalRequest,
  ChatAttachment,
  ChatConversation,
  ChatMessage,
  ChatScope,
  ChatSlashCommandResult,
  ChatSlashCommand,
  ClientFrame,
  DecisionAnswer,
  DecisionRequest,
  ModelEntry,
  MessageContextState,
  RelayInstanceInfo,
  ServerFrame,
  SessionControlCommand,
  SuperChatSettings,
  StructuredSlashCommandName,
} from "@/modules/ai_assistant/domain/contracts";
import { DEFAULT_CHAT_SLASH_COMMANDS } from "@/modules/ai_assistant/domain/slashCommand";
import { buildLocalUserMessage } from "@/modules/ai_assistant/domain/message";
import { settleUnfinishedToolMessages } from "@/modules/ai_assistant/domain/toolMessage";
import {
  scopeForProject,
  scopeSessionKey,
} from "@/modules/ai_assistant/domain/scope";
import { upsertAssistantMessage } from "@/modules/ai_assistant/application/messageProjection";
import { sortMessages } from "@/modules/ai_assistant/application/messageTimeline";
import { useSuperChatFrameController } from "@/modules/ai_assistant/application/useFrameController";

const TURN_HISTORY_RECONCILIATION_MS = 5_000;
const MESSAGE_CACHE_WRITE_DELAY_MS = 300;

export type ChatSessionSocketOptions = {
  scope: ChatScope;
  onFrame: (frame: ServerFrame) => void;
  hasActiveTurn: () => boolean;
  onConnectedChange: (connected: boolean) => void;
  onConnectingChange: (connecting: boolean) => void;
  onErrorChange: (error: string | null) => void;
  onActiveTurnDisconnect: () => void;
};

export type ChatSessionSocket = {
  connect: () => void;
  disconnect: () => void;
  send: (frame: ClientFrame) => void;
  close: (code?: number, reason?: string) => void;
};

export type ChatSessionPorts = {
  appendChatNotification: (
    scope: ChatScope,
    text: string,
  ) => Promise<{ delivered: boolean; message: ChatMessage | null }>;
  cancelChatBestEffort: () => Promise<void>;
  resolveChatDecision: (
    decisionId: string,
    answers: DecisionAnswer[],
  ) => Promise<void>;
  runChatSlashCommand: (
    scope: ChatScope,
    command: StructuredSlashCommandName,
  ) => Promise<ChatSlashCommandResult>;
  setChatMessageContextState: (
    scope: ChatScope,
    messageId: string,
    state: MessageContextState,
  ) => Promise<void>;
  clearActiveTurn: (scopeKey: string, turnId?: string | null) => void;
  createSuperChatSocketSession: (
    options: ChatSessionSocketOptions,
  ) => ChatSessionSocket;
  loadCachedMessages: (scopeKey: string) => ChatMessage[];
  loadChatModels: () => Promise<ModelEntry[]>;
  loadPendingActiveTurn: (
    scopeKey: string,
    messages: ChatMessage[],
  ) => { turnId: string; startedAt: number } | null;
  loadScopedMessageIds: (scopeKey: string) => {
    pinnedIds: Set<string>;
    deletedIds: Set<string>;
  };
  loadSuperChatSettings: () => SuperChatSettings;
  pruneOldMessageCaches: () => void;
  saveActiveTurn: (scopeKey: string, turnId: string) => void;
  saveCachedMessages: (scopeKey: string, messages: ChatMessage[]) => void;
  saveScopedMessageIds: (
    scopeKey: string,
    kind: "pinned" | "deleted",
    ids: Set<string>,
  ) => void;
  saveSuperChatSettings: (settings: SuperChatSettings) => void;
};

export type UseChatSessionOptions = {
  project?: string;
  conversationId?: string;
  displayName: string;
};

export function useChatSessionController({
  project,
  conversationId = "main",
  displayName,
  ports,
}: UseChatSessionOptions & { ports: ChatSessionPorts }) {
  const {
    appendChatNotification,
    cancelChatBestEffort,
    clearActiveTurn,
    createSuperChatSocketSession,
    loadCachedMessages,
    loadChatModels,
    loadPendingActiveTurn,
    loadScopedMessageIds,
    loadSuperChatSettings,
    pruneOldMessageCaches,
    resolveChatDecision: resolveChatDecisionThroughPort,
    runChatSlashCommand: runChatSlashCommandThroughPort,
    saveActiveTurn,
    saveCachedMessages,
    saveScopedMessageIds,
    saveSuperChatSettings,
    setChatMessageContextState,
  } = ports;
  const desiredScope = useMemo(
    () => scopeForProject(project, conversationId),
    [conversationId, project],
  );
  const scopeKey = useMemo(() => scopeSessionKey(desiredScope), [desiredScope]);
  // Mirrors `scopeKey` for async callbacks that resolve after the user may have
  // switched conversations. Assigned during render so a callback awaiting an
  // in-flight request always compares against the scope that is current *now*,
  // not the one captured when it started.
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;
  const initialScopeSnapshot = useMemo(() => {
    const cachedMessages = loadCachedMessages(scopeKey);
    const activeTurn = loadPendingActiveTurn(scopeKey, cachedMessages);
    return {
      cachedMessages,
      activeTurnId: activeTurn?.turnId ?? null,
    };
  }, [loadCachedMessages, loadPendingActiveTurn, scopeKey]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => initialScopeSnapshot.cachedMessages,
  );
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [decisions, setDecisions] = useState<DecisionRequest[]>([]);
  const [submittingDecisionIds, setSubmittingDecisionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [relayInstances, setRelayInstances] = useState<RelayInstanceInfo[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>("");
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [activeReasoningEffort, setActiveReasoningEffort] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [slashCommands, setSlashCommands] = useState<ChatSlashCommand[]>(
    DEFAULT_CHAT_SLASH_COMMANDS,
  );
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [settings, setSettingsState] = useState<SuperChatSettings>(
    () => loadSuperChatSettings(),
  );
  const [busy, setBusy] = useState(
    () => Boolean(initialScopeSnapshot.activeTurnId),
  );
  const [activeTurnId, setActiveTurnId] = useState<string | null>(
    initialScopeSnapshot.activeTurnId,
  );
  const streamTextRef = useRef("");
  const messagesRef = useRef<ChatMessage[]>(initialScopeSnapshot.cachedMessages);
  // Bumped by the scope-reset effect below. A render whose closure captured a
  // smaller epoch predates that effect's reseed, so its `messages` may still
  // hold the previous conversation's history — persisting that pair would
  // cache one conversation under another conversation's key.
  const reseedEpochRef = useRef(0);
  // Captured at render time so effects can tell whether this render saw the
  // latest reseed (see the cache-write effect below).
  const renderedReseedEpoch = reseedEpochRef.current;
  const activeTurnIdRef = useRef<string | null>(initialScopeSnapshot.activeTurnId);
  const pendingClientTurnIdRef = useRef<string | null>(null);
  const recentlyCompletedTurnIdRef = useRef<string | null>(null);
  const cancelledTurnIdsRef = useRef<Set<string>>(new Set());
  const socketSessionRef = useRef<ChatSessionSocket | null>(null);

  const sendFrame = useCallback((frame: ClientFrame) => {
    socketSessionRef.current?.send(frame);
  }, []);

  const requestHistory = useCallback(() => {
    sendFrame({ type: "scope.set", scope: desiredScope });
  }, [desiredScope, sendFrame]);

  const deleteConversation = useCallback((targetConversationId: string) => {
    const normalizedId = targetConversationId.trim();
    if (!normalizedId || !connected || busy) return false;
    sendFrame({
      type: "conversation.delete",
      scope: desiredScope,
      conversationId: normalizedId,
    });
    return true;
  }, [busy, connected, desiredScope, sendFrame]);

  const markTurnActive = useCallback((turnId: string | null) => {
    if (!turnId) return;
    activeTurnIdRef.current = turnId;
    setActiveTurnId(turnId);
    recentlyCompletedTurnIdRef.current = null;
    saveActiveTurn(scopeKey, turnId);
    setBusy(true);
  }, [saveActiveTurn, scopeKey]);

  const markTurnInactive = useCallback((turnId?: string | null) => {
    clearActiveTurn(scopeKey, turnId);
    streamTextRef.current = "";
    activeTurnIdRef.current = null;
    setActiveTurnId(null);
    pendingClientTurnIdRef.current = null;
    recentlyCompletedTurnIdRef.current = turnId ?? null;
    setStreamText("");
    setBusy(false);
  }, [clearActiveTurn, scopeKey]);

  const setSettings = useCallback((patch: Partial<SuperChatSettings>) => {
    setSettingsState((current) => {
      const next = { ...current, ...patch };
      saveSuperChatSettings(next);
      return next;
    });
  }, [saveSuperChatSettings]);

  const finalizeStream = useCallback(() => {
    const turnId = activeTurnIdRef.current ?? `turn-${Date.now()}`;
    if (cancelledTurnIdsRef.current.has(turnId)) {
      markTurnInactive(turnId);
      return;
    }
    setMessages((current) => {
      if (!streamTextRef.current.trim()) return current;
      return upsertAssistantMessage(current, turnId, streamTextRef.current);
    });
    markTurnInactive(turnId);
  }, [markTurnInactive]);

  const handleFrame = useSuperChatFrameController({
    desiredScope,
    showToolEvents: settings.showToolEvents,
    messagesRef,
    activeTurnIdRef,
    pendingClientTurnIdRef,
    recentlyCompletedTurnIdRef,
    cancelledTurnIdsRef,
    streamTextRef,
    setConnected,
    setConnecting,
    setError,
    setHistoryReady,
    setConversations,
    setDecisions,
    setDeletedIds,
    setMessages,
    setActiveModel,
    setActiveReasoningEffort,
    setModelsLoading,
    setPinnedIds,
    setSlashCommands,
    setBusy,
    setStreamText,
    markTurnActive,
    markTurnInactive,
    finalizeStream,
  });

  useEffect(() => {
    setRelayInstances([]);
    setSelectedInstanceId("");
    setModels([]);
    setActiveModel(null);
    setActiveReasoningEffort(null);
    setModelsLoading(false);
    setSlashCommands(DEFAULT_CHAT_SLASH_COMMANDS);
    setConversations([]);
    setDecisions([]);
    setSubmittingDecisionIds(new Set());
    setHistoryReady(false);
    streamTextRef.current = "";
    pendingClientTurnIdRef.current = null;
    recentlyCompletedTurnIdRef.current = null;
    setStreamText("");
    const cachedMessages = loadCachedMessages(scopeKey);
    // Advance the reseed epoch so cache writes from renders that closed over
    // the previous conversation's messages are skipped (see the cache-write
    // effect below).
    reseedEpochRef.current += 1;
    setMessages(cachedMessages);
    messagesRef.current = cachedMessages;
    const activeTurn = loadPendingActiveTurn(scopeKey, cachedMessages);
    activeTurnIdRef.current = activeTurn?.turnId ?? null;
    setActiveTurnId(activeTurn?.turnId ?? null);
    setBusy(Boolean(activeTurn));
  }, [loadCachedMessages, loadPendingActiveTurn, scopeKey]);

  useEffect(() => {
    pruneOldMessageCaches();
  }, [pruneOldMessageCaches]);

  useEffect(() => {
    // The reset effect above bumps the epoch when it reseeds `messages`, and
    // it runs before this effect in the same commit. A closure that captured a
    // smaller epoch therefore predates the latest reseed: `messages` may still
    // hold the previous conversation's history while `scopeKey` is already the
    // new one. Writing that pair would cache the old conversation under the
    // new key — directly, or via the pagehide flush that reads messagesRef.
    // Once the epochs match, every later render is derived from the reseeded
    // history of the current scope, so updates that interleaved with the
    // reseed commit are persisted too (an identity check against the reseeded
    // array would skip them forever).
    if (renderedReseedEpoch !== reseedEpochRef.current) return;
    messagesRef.current = messages;
    const timer = window.setTimeout(
      () => saveCachedMessages(scopeKey, messages),
      MESSAGE_CACHE_WRITE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [messages, renderedReseedEpoch, saveCachedMessages, scopeKey]);

  useEffect(() => {
    const flush = () => saveCachedMessages(scopeKey, messagesRef.current);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [saveCachedMessages, scopeKey]);

  useEffect(() => {
    const currentActiveTurnId = activeTurnIdRef.current;
    if (
      !currentActiveTurnId
      || busy
      || activeTurnIsPending(messages, currentActiveTurnId)
    ) {
      return;
    }
    clearActiveTurn(scopeKey, currentActiveTurnId);
    activeTurnIdRef.current = null;
    setActiveTurnId(null);
    pendingClientTurnIdRef.current = null;
    setBusy(false);
  }, [busy, clearActiveTurn, messages, scopeKey]);

  useEffect(() => {
    const scopedIds = loadScopedMessageIds(scopeKey);
    setPinnedIds(scopedIds.pinnedIds);
    setDeletedIds(scopedIds.deletedIds);
  }, [loadScopedMessageIds, scopeKey]);

  useEffect(() => {
    const session = createSuperChatSocketSession({
      scope: desiredScope,
      onFrame: handleFrame,
      hasActiveTurn: () => Boolean(
        activeTurnIdRef.current ?? pendingClientTurnIdRef.current,
      ),
      onConnectedChange: setConnected,
      onConnectingChange: setConnecting,
      onErrorChange: setError,
      onActiveTurnDisconnect: () => setBusy(true),
    });
    socketSessionRef.current = session;
    const connectTimer = window.setTimeout(session.connect, 50);
    return () => {
      window.clearTimeout(connectTimer);
      session.disconnect();
      if (socketSessionRef.current === session) {
        socketSessionRef.current = null;
      }
    };
  }, [createSuperChatSocketSession, desiredScope, handleFrame]);

  useEffect(() => {
    if (!connected || !busy) return;
    const timer = window.setInterval(
      requestHistory,
      TURN_HISTORY_RECONCILIATION_MS,
    );
    return () => window.clearInterval(timer);
  }, [busy, connected, requestHistory]);

  const wasBusyRef = useRef(busy);
  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = busy;
    if (!connected || busy || !wasBusy) return;
    const timer = window.setTimeout(requestHistory, 750);
    return () => window.clearTimeout(timer);
  }, [busy, connected, requestHistory]);

  const send = useCallback((
    text: string,
    attachments: ChatAttachment[] = [],
    transportText?: string,
  ) => {
    const trimmed = text.trim();
    if (!trimmed || !connected) return false;
    const outboundText = transportText?.trim() || trimmed;
    const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingClientTurnIdRef.current = turnId;
    markTurnActive(turnId);
    setMessages((current) => [
      ...current,
      buildLocalUserMessage(trimmed, turnId, displayName, attachments),
    ]);
    streamTextRef.current = "";
    setStreamText("");
    sendFrame({
      type: "chat.message",
      scope: desiredScope,
      text: outboundText,
      turn_id: turnId,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    return true;
  }, [connected, desiredScope, displayName, markTurnActive, sendFrame]);

  const appendNotification = useCallback(async (text: string): Promise<boolean> => {
    const originScopeKey = scopeKeyRef.current;
    const result = await appendChatNotification(desiredScope, text);
    // The await can span a conversation switch. `setMessages` targets whichever
    // conversation is mounted now, so applying a stale result would inject the
    // old conversation's notification into the new one — and the message-cache
    // effect would then persist it there under the new scope key.
    if (result.message && scopeKeyRef.current === originScopeKey) {
      setMessages((current) => sortMessages([...current, result.message!]));
    }
    return result.delivered;
  }, [appendChatNotification, desiredScope]);

  const runSlashCommand = useCallback((command: StructuredSlashCommandName) => {
    if (!connected) {
      return Promise.reject(new Error("助手尚未连接，请稍后重试。"));
    }
    if (busy) {
      return Promise.reject(new Error("当前对话正在执行任务，请在本轮结束后再运行命令。"));
    }
    return runChatSlashCommandThroughPort(desiredScope, command);
  }, [busy, connected, desiredScope, runChatSlashCommandThroughPort]);

  const abort = useCallback(() => {
    const turnId = activeTurnIdRef.current ?? pendingClientTurnIdRef.current;
    if (turnId) {
      cancelledTurnIdsRef.current.add(turnId);
      setMessages((current) => settleUnfinishedToolMessages(
        current,
        turnId,
        "本轮已取消，当前没有任务在执行",
      ));
    }
    markTurnInactive(turnId);
    setDecisions([]);
    setSubmittingDecisionIds(new Set());
    void cancelChatBestEffort();
    socketSessionRef.current?.close(4000, "client abort");
  }, [cancelChatBestEffort, markTurnInactive]);

  const resolveDecision = useCallback(async (
    decision: DecisionRequest,
    answers: DecisionAnswer[],
  ): Promise<boolean> => {
    const originScopeKey = scopeKeyRef.current;
    if (submittingDecisionIds.has(decision.id)) return false;
    setSubmittingDecisionIds((current) => new Set(current).add(decision.id));
    setError(null);
    try {
      await resolveChatDecisionThroughPort(decision.id, answers);
      if (scopeKeyRef.current === originScopeKey) {
        setDecisions((current) => current.filter((item) => item.id !== decision.id));
      }
      return true;
    } catch (decisionError) {
      if (scopeKeyRef.current === originScopeKey) {
        setError(
          decisionError instanceof Error
            ? decisionError.message
            : "提交确认失败，请重试",
        );
      }
      return false;
    } finally {
      setSubmittingDecisionIds((current) => {
        const next = new Set(current);
        next.delete(decision.id);
        return next;
      });
    }
  }, [resolveChatDecisionThroughPort, submittingDecisionIds]);

  const resolveApproval = useCallback((
    _approval: ApprovalRequest,
    _decision: "allow-once" | "allow-always" | "deny",
  ) => {
    setApprovals([]);
  }, []);

  const refreshRelayInstances = useCallback(() => {
    setRelayInstances([]);
  }, []);

  const selectRelayInstance = useCallback((_instanceId: string) => {
    setSelectedInstanceId("");
  }, []);

  const refreshModels = useCallback(async () => {
    const originScopeKey = scopeKeyRef.current;
    setModelsLoading(true);
    try {
      const entries = await loadChatModels();
      if (scopeKeyRef.current === originScopeKey) {
        setModels(entries);
      }
    } catch {
      if (scopeKeyRef.current === originScopeKey) {
        setModels([]);
        setError("加载模型列表失败，请检查右上角模型设置后重试。");
      }
    } finally {
      if (scopeKeyRef.current === originScopeKey) {
        setModelsLoading(false);
      }
    }
  }, [loadChatModels]);

  const switchModel = useCallback((modelId: string) => {
    if (!connected || busy || modelsLoading) return false;
    setError(null);
    setModelsLoading(true);
    sendFrame({
      type: "session.model.set",
      scope: desiredScope,
      selector: modelId === "auto" ? null : modelId,
    });
    return true;
  }, [busy, connected, desiredScope, modelsLoading, sendFrame]);

  const switchReasoningEffort = useCallback((reasoningEffort: string) => {
    if (!connected || busy || modelsLoading) return false;
    const modelId = activeModel ?? "auto";
    const selected = models.find((model) => model.id === modelId);
    if (
      !selected?.reasoningEfforts?.length
      || !selected.reasoningEfforts.includes(reasoningEffort)
    ) return false;
    setError(null);
    setModelsLoading(true);
    sendFrame({
      type: "session.model.set",
      scope: desiredScope,
      selector: modelId === "auto" ? null : modelId,
      reasoning_effort: reasoningEffort,
    });
    return true;
  }, [activeModel, busy, connected, desiredScope, models, modelsLoading, sendFrame]);

  useEffect(() => {
    if (!connected) return;
    void refreshModels();
    sendFrame({ type: "session.model.get", scope: desiredScope });
  }, [connected, desiredScope, refreshModels, sendFrame]);

  const sessionControl = useCallback((
    _command: SessionControlCommand,
    _args?: string,
  ) => {
    // The native chat endpoint does not expose external session-control commands.
  }, []);

  const applyMessageContextState = useCallback((
    id: string,
    state: MessageContextState,
  ) => {
    setMessages((current) => current.map((message) => (
      message.id === id ? { ...message, contextState: state } : message
    )));
    setPinnedIds((current) => {
      const next = new Set(current);
      if (state === "pinned") next.add(id);
      else next.delete(id);
      saveScopedMessageIds(scopeKey, "pinned", next);
      return next;
    });
    setDeletedIds((current) => {
      const next = new Set(current);
      if (state === "excluded") next.add(id);
      else next.delete(id);
      saveScopedMessageIds(scopeKey, "deleted", next);
      return next;
    });
  }, [saveScopedMessageIds, scopeKey]);

  const persistMessageContextState = useCallback(async (
    id: string,
    state: MessageContextState,
  ) => {
    const previous = messagesRef.current.find((message) => message.id === id)
      ?.contextState ?? "normal";
    applyMessageContextState(id, state);
    try {
      await setChatMessageContextState(desiredScope, id, state);
    } catch {
      applyMessageContextState(id, previous);
      setError("消息上下文状态保存失败，请重试。");
    }
  }, [applyMessageContextState, desiredScope, setChatMessageContextState]);

  const togglePin = useCallback((id: string) => {
    const state = pinnedIds.has(id) ? "normal" : "pinned";
    void persistMessageContextState(id, state);
  }, [persistMessageContextState, pinnedIds]);

  const deleteMessage = useCallback((id: string) => {
    const state = deletedIds.has(id) ? "normal" : "excluded";
    void persistMessageContextState(id, state);
  }, [deletedIds, persistMessageContextState]);

  const clearPinned = useCallback(() => {
    for (const id of pinnedIds) {
      void persistMessageContextState(id, "normal");
    }
  }, [persistMessageContextState, pinnedIds]);

  return {
    abort,
    approvals,
    activeTurnId,
    busy,
    connected,
    connecting,
    conversations,
    decisions,
    error,
    activeModel,
    activeReasoningEffort,
    appendNotification,
    clearPinned,
    deleteConversation,
    deleteMessage,
    deletedIds,
    historyReady,
    messages,
    models,
    modelsLoading,
    requestHistory,
    refreshModels,
    refreshRelayInstances,
    relayInstances,
    resolveDecision,
    resolveApproval,
    selectRelayInstance,
    runSlashCommand,
    send,
    selectedInstanceId,
    sessionControl,
    setSettings,
    settings,
    slashCommands,
    pinnedIds,
    streamText,
    submittingDecisionIds,
    switchModel,
    switchReasoningEffort,
    togglePin,
  };
}
