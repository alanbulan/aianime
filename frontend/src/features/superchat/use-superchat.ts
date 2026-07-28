// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApprovalRequest,
  ChatAttachment,
  ChatMessage,
  ClientFrame,
  ModelEntry,
  RelayInstanceInfo,
  ServerFrame,
  SessionControlCommand,
  SuperChatSettings,
} from "@/features/superchat/types";
import {
  buildLocalUserMessage,
  normalizeMessage,
} from "@/features/superchat/message";
import { api } from "@/shared/api/transport";
import {
  activeTurnIsPending,
  clearActiveTurn,
  currentTurnIsLive,
  loadPendingActiveTurn,
  saveActiveTurn,
} from "@/features/superchat/active-turn";
import {
  loadCachedMessages,
  pruneOldMessageCaches,
  saveCachedMessages,
} from "@/features/superchat/message-cache";
import {
  mergeHistorySnapshot,
  normalizeHistory,
  sortMessages,
  turnCompletedInHistory,
} from "@/features/superchat/message-timeline";
import {
  appendToolMessage,
  shouldPreserveToolMessage,
  upsertAssistantMessage,
  upsertServerAssistantMessage,
  upsertToolMessage,
} from "@/features/superchat/message-projection";
import {
  loadScopedMessageIds,
  loadSuperChatSettings,
  saveScopedMessageIds,
  saveSuperChatSettings,
} from "@/features/superchat/preferences-storage";
import {
  isChatScope,
  scopeForProject,
  scopeMatches,
  scopeSessionKey,
} from "@/features/superchat/scope";
import {
  createSuperChatSocketSession,
  type SuperChatSocketSession,
} from "@/features/superchat/socket-session";

type ChatNotificationResponse = {
  ok: boolean;
  data?: unknown;
};

export function useSuperChat({
  project,
  displayName,
}: {
  project?: string;
  displayName: string;
}) {
  const desiredScope = useMemo(() => scopeForProject(project), [project]);
  const scopeKey = useMemo(() => scopeSessionKey(desiredScope), [desiredScope]);
  const initialScopeSnapshot = useMemo(() => {
    const cachedMessages = loadCachedMessages(scopeKey);
    const activeTurn = loadPendingActiveTurn(scopeKey, cachedMessages);
    return {
      cachedMessages,
      activeTurnId: activeTurn?.turnId ?? null,
    };
  }, [scopeKey]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialScopeSnapshot.cachedMessages);
  const [historyReady, setHistoryReady] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [relayInstances, setRelayInstances] = useState<RelayInstanceInfo[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>("");
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [settings, setSettingsState] = useState<SuperChatSettings>(() => loadSuperChatSettings());
  const [busy, setBusy] = useState(() => Boolean(initialScopeSnapshot.activeTurnId));
  const [activeTurnId, setActiveTurnId] = useState<string | null>(initialScopeSnapshot.activeTurnId);
  const streamTextRef = useRef("");
  const messagesRef = useRef<ChatMessage[]>(initialScopeSnapshot.cachedMessages);
  const activeTurnIdRef = useRef<string | null>(initialScopeSnapshot.activeTurnId);
  const pendingClientTurnIdRef = useRef<string | null>(null);
  const recentlyCompletedTurnIdRef = useRef<string | null>(null);
  const cancelledTurnIdsRef = useRef<Set<string>>(new Set());
  const socketSessionRef = useRef<SuperChatSocketSession | null>(null);

  const sendFrame = useCallback((frame: ClientFrame) => {
    socketSessionRef.current?.send(frame);
  }, []);

  const requestHistory = useCallback(() => {
    sendFrame({ type: "scope.set", scope: desiredScope });
  }, [desiredScope, sendFrame]);

  const markTurnActive = useCallback((turnId: string | null) => {
    if (!turnId) return;
    activeTurnIdRef.current = turnId;
    setActiveTurnId(turnId);
    recentlyCompletedTurnIdRef.current = null;
    saveActiveTurn(scopeKey, turnId);
    setBusy(true);
  }, [scopeKey]);

  const markTurnInactive = useCallback((turnId?: string | null) => {
    clearActiveTurn(scopeKey, turnId);
    streamTextRef.current = "";
    activeTurnIdRef.current = null;
    setActiveTurnId(null);
    pendingClientTurnIdRef.current = null;
    recentlyCompletedTurnIdRef.current = turnId ?? null;
    setStreamText("");
    setBusy(false);
  }, [scopeKey]);

  const setSettings = useCallback((patch: Partial<SuperChatSettings>) => {
    setSettingsState((current) => {
      const next = { ...current, ...patch };
      saveSuperChatSettings(next);
      return next;
    });
  }, []);

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
    // Post-done history refresh is intentionally disabled; final assistant
    // messages are now pushed through assistant.message.
  }, [markTurnInactive]);

  const handleFrame = useCallback((frame: ServerFrame) => {
    switch (frame.type) {
      case "scope.changed": {
        setConnected(true);
        setConnecting(false);
        setError(null);
        const frameScope = isChatScope(frame.scope) ? frame.scope : undefined;
        if (!scopeMatches(frameScope, desiredScope)) break;
        setHistoryReady(true);
        const history = normalizeHistory(Array.isArray(frame.history) ? frame.history : []);
        const currentMessages = messagesRef.current;
        const protectedTurnId = activeTurnIdRef.current ?? recentlyCompletedTurnIdRef.current;
        setMessages((current) => {
          const preserveRemoteBusy = frame.busy === true && currentTurnIsLive(protectedTurnId, current);
          return mergeHistorySnapshot(current, history, protectedTurnId, preserveRemoteBusy);
        });
        const activeTurnId = activeTurnIdRef.current;
        if (frame.busy === true && currentTurnIsLive(activeTurnId, currentMessages)) {
          setBusy(true);
        } else if (activeTurnId) {
          if (turnCompletedInHistory(activeTurnId, history, currentMessages)) {
            markTurnInactive(activeTurnId);
          } else if (!currentTurnIsLive(activeTurnId, currentMessages)) {
            markTurnInactive(activeTurnId);
          } else {
            setBusy(true);
          }
        } else if (!activeTurnIdRef.current) {
          streamTextRef.current = "";
          recentlyCompletedTurnIdRef.current = null;
          setStreamText("");
          setBusy(false);
        }
        break;
      }
      case "chat.busy": {
        const message = typeof frame.message === "string" ? frame.message : null;
        if (message) setError(message);
        const turnId =
          activeTurnIdRef.current
          ?? pendingClientTurnIdRef.current
          ?? (typeof frame.turn_id === "string" && frame.turn_id.trim() ? frame.turn_id : null);
        if (turnId) {
          markTurnActive(turnId);
        } else {
          setBusy(true);
        }
        break;
      }
      case "chat.ping": {
        if (
          typeof frame.turn_id === "string"
          && cancelledTurnIdsRef.current.has(frame.turn_id)
        ) {
          break;
        }
        const turnId =
          activeTurnIdRef.current
          ?? pendingClientTurnIdRef.current
          ?? (typeof frame.turn_id === "string" && frame.turn_id.trim() ? frame.turn_id : null);
        if (turnId) {
          markTurnActive(turnId);
        } else {
          setBusy(true);
        }
        break;
      }
      case "thread.started":
        if (
          typeof frame.turn_id === "string"
          && cancelledTurnIdsRef.current.has(frame.turn_id)
        ) {
          break;
        }
        activeTurnIdRef.current = pendingClientTurnIdRef.current
          ?? (typeof frame.turn_id === "string" && frame.turn_id.trim() ? frame.turn_id : activeTurnIdRef.current);
        if (activeTurnIdRef.current) {
          markTurnActive(activeTurnIdRef.current);
        }
        recentlyCompletedTurnIdRef.current = null;
        break;
      case "assistant.delta": {
        const next = typeof frame.text === "string" ? frame.text : "";
        if (!next) break;
        if (
          typeof frame.turn_id === "string"
          && cancelledTurnIdsRef.current.has(frame.turn_id)
        ) {
          break;
        }
        setBusy(true);
        streamTextRef.current = frame.accumulated === false
          ? `${streamTextRef.current}${next}`
          : next;
        const turnId =
          pendingClientTurnIdRef.current
          ?? activeTurnIdRef.current
          ?? (typeof frame.turn_id === "string" && frame.turn_id.trim() ? frame.turn_id : null);
        if (turnId && streamTextRef.current.trim()) {
          markTurnActive(turnId);
          setMessages((current) => {
            const displayText = streamTextRef.current;
            if (!displayText.trim()) return current;
            return upsertAssistantMessage(current, turnId, displayText);
          });
        }
        setStreamText("");
        break;
      }
      case "assistant.message":
        setMessages((current) =>
          upsertServerAssistantMessage(
            current,
            frame.message,
            typeof frame.turn_id === "string" ? frame.turn_id : undefined,
          ),
        );
        break;
      case "tool.call":
        if (
          typeof frame.turn_id === "string"
          && cancelledTurnIdsRef.current.has(frame.turn_id)
        ) {
          break;
        }
        if (settings.showToolEvents || shouldPreserveToolMessage(frame)) {
          setMessages((current) => upsertToolMessage(current, frame.type, frame));
        }
        break;
      case "tool.result":
        if (
          typeof frame.turn_id === "string"
          && cancelledTurnIdsRef.current.has(frame.turn_id)
        ) {
          break;
        }
        if (typeof frame.turn_id === "string" && frame.turn_id.trim()) {
          markTurnActive(frame.turn_id);
        } else {
          setBusy(true);
        }
        if (settings.showToolEvents || shouldPreserveToolMessage(frame)) {
          setMessages((current) => upsertToolMessage(current, frame.type, frame));
        }
        break;
      case "chat.done":
        if (
          typeof frame.turn_id === "string"
          && cancelledTurnIdsRef.current.has(frame.turn_id)
        ) {
          cancelledTurnIdsRef.current.delete(frame.turn_id);
          markTurnInactive(frame.turn_id);
          break;
        }
        finalizeStream();
        break;
      case "project.created":
        setMessages((current) => appendToolMessage(current, frame.type, frame));
        break;
      case "error":
        setError(typeof frame.message === "string" ? frame.message : "Unknown chat error");
        if (typeof frame.message === "string" && frame.message.includes("当前用户已有 AI 对话正在处理中")) {
          setBusy(true);
          break;
        }
        markTurnInactive(activeTurnIdRef.current ?? pendingClientTurnIdRef.current);
        setConnecting(false);
        break;
      default:
        break;
    }
  }, [desiredScope, finalizeStream, markTurnActive, markTurnInactive, settings.showToolEvents]);

  useEffect(() => {
    setRelayInstances([]);
    setSelectedInstanceId("");
    setModels([]);
    setActiveModel(null);
    setModelsLoading(false);
    setHistoryReady(false);
    streamTextRef.current = "";
    pendingClientTurnIdRef.current = null;
    recentlyCompletedTurnIdRef.current = null;
    setStreamText("");
    const cachedMessages = loadCachedMessages(scopeKey);
    setMessages(cachedMessages);
    messagesRef.current = cachedMessages;
    const activeTurn = loadPendingActiveTurn(scopeKey, cachedMessages);
    activeTurnIdRef.current = activeTurn?.turnId ?? null;
    setActiveTurnId(activeTurn?.turnId ?? null);
    setBusy(Boolean(activeTurn));
  }, [desiredScope, scopeKey]);

  // Sweep stale/legacy message caches once on mount so abandoned conversations
  // don't accumulate and eventually exhaust the localStorage quota.
  useEffect(() => {
    pruneOldMessageCaches();
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    saveCachedMessages(scopeKey, messages);
  }, [messages, scopeKey]);

  useEffect(() => {
    const activeTurnId = activeTurnIdRef.current;
    if (!activeTurnId || busy || activeTurnIsPending(messages, activeTurnId)) return;
    clearActiveTurn(scopeKey, activeTurnId);
    activeTurnIdRef.current = null;
    setActiveTurnId(null);
    pendingClientTurnIdRef.current = null;
    setBusy(false);
  }, [busy, messages, scopeKey]);

  useEffect(() => {
    const scopedIds = loadScopedMessageIds(scopeKey);
    setPinnedIds(scopedIds.pinnedIds);
    setDeletedIds(scopedIds.deletedIds);
  }, [scopeKey]);

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
  }, [desiredScope, handleFrame]);

  const send = useCallback((text: string, attachments: ChatAttachment[] = [], transportText?: string) => {
    const trimmed = text.trim();
    if (!trimmed || !connected) return false;
    const outboundText = transportText?.trim() || trimmed;
    const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingClientTurnIdRef.current = turnId;
    markTurnActive(turnId);
    setMessages((current) => [...current, buildLocalUserMessage(trimmed, turnId, displayName, attachments)]);
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
    const trimmed = text.trim();
    if (!trimmed) return false;
    try {
      const response = await api
        .post("api/v1/chat/notifications", {
          json: {
            scope: desiredScope,
            text: trimmed,
          },
        })
        .json<ChatNotificationResponse>();
      const message = normalizeMessage(response.data, "assistant");
      if (message) {
        setMessages((current) => sortMessages([...current, message]));
      }
      return true;
    } catch (error) {
      console.error("[superchat] append notification failed", error);
      const fallback = normalizeMessage(
        {
          id: `task-notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: "assistant",
          content: trimmed,
          created_at: new Date().toISOString(),
        },
        "assistant",
      );
      if (fallback) {
        setMessages((current) => sortMessages([...current, fallback]));
      }
      return false;
    }
  }, [desiredScope]);

  const abort = useCallback(() => {
    const turnId = activeTurnIdRef.current ?? pendingClientTurnIdRef.current;
    if (turnId) {
      cancelledTurnIdsRef.current.add(turnId);
    }
    markTurnInactive(turnId);
    void api.post("api/v1/chat/cancel").catch(() => undefined);
    socketSessionRef.current?.close(4000, "client abort");
  }, [markTurnInactive]);

  const resolveApproval = useCallback((_approval: ApprovalRequest, _decision: "allow-once" | "allow-always" | "deny") => {
    setApprovals([]);
  }, []);

  const refreshRelayInstances = useCallback(() => {
    setRelayInstances([]);
  }, []);

  const selectRelayInstance = useCallback((_instanceId: string) => {
    setSelectedInstanceId("");
  }, []);

  const refreshModels = useCallback(() => {
    setModels([]);
    setActiveModel(null);
    setModelsLoading(false);
  }, []);

  const switchModel = useCallback((_modelId: string) => {
    setModelsLoading(false);
  }, []);

  const sessionControl = useCallback((_command: SessionControlCommand, _args?: string) => {
    // ai_anime's native chat endpoint does not expose external session-control commands.
  }, []);

  const togglePin = useCallback((id: string) => {
    setPinnedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveScopedMessageIds(scopeKey, "pinned", next);
      return next;
    });
  }, [scopeKey]);

  const deleteMessage = useCallback((id: string) => {
    setDeletedIds((current) => {
      const next = new Set(current);
      next.add(id);
      saveScopedMessageIds(scopeKey, "deleted", next);
      return next;
    });
    setPinnedIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      saveScopedMessageIds(scopeKey, "pinned", next);
      return next;
    });
  }, [scopeKey]);

  const clearPinned = useCallback(() => {
    const next = new Set<string>();
    setPinnedIds(next);
    saveScopedMessageIds(scopeKey, "pinned", next);
  }, [scopeKey]);

  return {
    abort,
    approvals,
    activeTurnId,
    busy,
    connected,
    connecting,
    error,
    activeModel,
    appendNotification,
    clearPinned,
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
    resolveApproval,
    selectRelayInstance,
    send,
    selectedInstanceId,
    sessionControl,
    setSettings,
    settings,
    pinnedIds,
    streamText,
    switchModel,
    togglePin,
  };
}
