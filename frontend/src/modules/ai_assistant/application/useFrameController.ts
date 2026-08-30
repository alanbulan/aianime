// Copyright (c) 2026 AI anime
import {
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { currentTurnIsLive } from "@/modules/ai_assistant/domain/activeTurn";
import type {
  ChatConversation,
  DecisionRequest,
  ChatMessage,
  ChatScope,
  ChatSlashCommand,
  ServerFrame,
} from "@/modules/ai_assistant/domain/contracts";
import { normalizeSlashCommands } from "@/modules/ai_assistant/domain/slashCommand";
import {
  isChatScope,
  scopeMatches,
} from "@/modules/ai_assistant/domain/scope";
import {
  normalizeDecision,
  normalizeDecisions,
} from "@/modules/ai_assistant/domain/decision";
import {
  appendToolMessage,
  shouldPreserveToolMessage,
  upsertAssistantMessage,
  upsertServerAssistantMessage,
  upsertToolMessage,
} from "@/modules/ai_assistant/application/messageProjection";
import {
  mergeHistorySnapshot,
  normalizeHistory,
  turnCompletedInHistory,
} from "@/modules/ai_assistant/application/messageTimeline";
import { settleRunningToolMessages } from "@/modules/ai_assistant/domain/toolMessage";

type MutableValue<T> = {
  current: T;
};

type FrameControllerOptions = {
  desiredScope: ChatScope;
  showToolEvents: boolean;
  messagesRef: MutableValue<ChatMessage[]>;
  activeTurnIdRef: MutableValue<string | null>;
  pendingClientTurnIdRef: MutableValue<string | null>;
  recentlyCompletedTurnIdRef: MutableValue<string | null>;
  cancelledTurnIdsRef: MutableValue<Set<string>>;
  streamTextRef: MutableValue<string>;
  setConnected: Dispatch<SetStateAction<boolean>>;
  setConnecting: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setHistoryReady: Dispatch<SetStateAction<boolean>>;
  setConversations: Dispatch<SetStateAction<ChatConversation[]>>;
  setDecisions: Dispatch<SetStateAction<DecisionRequest[]>>;
  setDeletedIds: Dispatch<SetStateAction<Set<string>>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setActiveModel: Dispatch<SetStateAction<string | null>>;
  setActiveReasoningEffort: Dispatch<SetStateAction<string | null>>;
  setModelsLoading: Dispatch<SetStateAction<boolean>>;
  setPinnedIds: Dispatch<SetStateAction<Set<string>>>;
  setSlashCommands: Dispatch<SetStateAction<ChatSlashCommand[]>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setStreamText: Dispatch<SetStateAction<string>>;
  markTurnActive: (turnId: string | null) => void;
  markTurnInactive: (turnId?: string | null) => void;
  finalizeStream: () => void;
};

export function useSuperChatFrameController({
  desiredScope,
  showToolEvents,
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
}: FrameControllerOptions): (frame: ServerFrame) => void {
  // Read through a ref rather than closing over the value: this callback is a
  // dependency of the WebSocket effect, so recreating it on every toggle of
  // "show tool events" tore down and reopened the live chat socket.
  const showToolEventsRef = useRef(showToolEvents);
  showToolEventsRef.current = showToolEvents;

  return useCallback((frame: ServerFrame) => {
    switch (frame.type) {
      case "scope.changed": {
        setConnected(true);
        setConnecting(false);
        setError(null);
        const frameScope = isChatScope(frame.scope) ? frame.scope : undefined;
        if (!scopeMatches(frameScope, desiredScope)) break;
        setSlashCommands(normalizeSlashCommands(frame.commands));
        setHistoryReady(true);
        setConversations(
          Array.isArray(frame.conversations)
            ? frame.conversations.filter((item): item is ChatConversation => (
                Boolean(item)
                && typeof item.id === "string"
                && typeof item.title === "string"
                && typeof item.updatedAt === "string"
                && typeof item.messageCount === "number"
              ))
            : [],
        );
        setDecisions(normalizeDecisions(frame.decisions));
        const history = normalizeHistory(Array.isArray(frame.history) ? frame.history : []);
        setPinnedIds(new Set(
          history
            .filter((message) => message.contextState === "pinned")
            .map((message) => message.id),
        ));
        setDeletedIds(new Set(
          history
            .filter((message) => message.contextState === "excluded")
            .map((message) => message.id),
        ));
        const remoteBusy = frame.busy === true;
        const remoteIdle = frame.busy === false;
        const activeTurnId = activeTurnIdRef.current;
        const awaitingServerAcceptance = Boolean(
          activeTurnId
          && pendingClientTurnIdRef.current === activeTurnId,
        );
        const protectedTurnId = activeTurnIdRef.current ?? recentlyCompletedTurnIdRef.current;
        setMessages((current) => {
          const preserveRemoteBusy = (remoteBusy || awaitingServerAcceptance)
            && currentTurnIsLive(protectedTurnId, current);
          const merged = mergeHistorySnapshot(
            current,
            history,
            protectedTurnId,
            preserveRemoteBusy,
          );
          return remoteIdle && !awaitingServerAcceptance
            ? settleRunningToolMessages(
                merged,
                null,
                "本轮已结束，当前没有任务在执行",
              )
            : merged;
        });
        if (
          activeTurnId
          && turnCompletedInHistory(activeTurnId, history)
        ) {
          markTurnInactive(activeTurnId);
        } else if (remoteBusy) {
          pendingClientTurnIdRef.current = null;
          setBusy(true);
        } else if (remoteIdle && activeTurnId && !awaitingServerAcceptance) {
          markTurnInactive(activeTurnId);
        } else if (activeTurnId) {
          if (!currentTurnIsLive(activeTurnId, messagesRef.current)) {
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
      case "commands.available":
        setSlashCommands(normalizeSlashCommands(frame.commands));
        break;
      case "session.model.state": {
        const frameScope = isChatScope(frame.scope) ? frame.scope : undefined;
        if (frameScope && !scopeMatches(frameScope, desiredScope)) break;
        setModelsLoading(false);
        if (typeof frame.error === "string" && frame.error.trim()) {
          setError(frame.error.trim());
          break;
        }
        setError(null);
        setActiveModel(
          typeof frame.selector === "string" && frame.selector.trim()
            ? frame.selector.trim()
            : "auto",
        );
        setActiveReasoningEffort(
          typeof frame.reasoning_effort === "string" && frame.reasoning_effort.trim()
            ? frame.reasoning_effort.trim()
            : null,
        );
        break;
      }
      case "decision_required": {
        const frameScope = isChatScope(frame.scope) ? frame.scope : undefined;
        if (frameScope && !scopeMatches(frameScope, desiredScope)) break;
        const decision = normalizeDecision(frame.decision);
        if (!decision) break;
        setDecisions((current) => [
          ...current.filter((item) => item.id !== decision.id),
          decision,
        ]);
        break;
      }
      case "decision_resolved": {
        const frameScope = isChatScope(frame.scope) ? frame.scope : undefined;
        if (frameScope && !scopeMatches(frameScope, desiredScope)) break;
        const decisionId = typeof frame.decision_id === "string"
          ? frame.decision_id.trim()
          : "";
        if (!decisionId) break;
        setDecisions((current) => current.filter((item) => item.id !== decisionId));
        break;
      }
      case "conversation.deleted": {
        const deletedConversationId = typeof frame.conversationId === "string"
          ? frame.conversationId
          : "";
        const nextConversations = Array.isArray(frame.conversations)
          ? frame.conversations.filter((item): item is ChatConversation => (
              Boolean(item)
              && typeof item.id === "string"
              && typeof item.title === "string"
              && typeof item.updatedAt === "string"
              && typeof item.messageCount === "number"
            ))
          : [];
        setConversations(nextConversations);
        if (deletedConversationId === desiredScope.conversationId) {
          messagesRef.current = [];
          streamTextRef.current = "";
          recentlyCompletedTurnIdRef.current = null;
          setMessages([]);
          setStreamText("");
          setHistoryReady(true);
          setBusy(false);
          setError(null);
        }
        break;
      }
      case "chat.busy": {
        const message = typeof frame.message === "string" ? frame.message : null;
        if (message) setError(message);
        const turnId =
          activeTurnIdRef.current
          ?? pendingClientTurnIdRef.current
          ?? (typeof frame.turn_id === "string" && frame.turn_id.trim()
            ? frame.turn_id
            : null);
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
          ?? (typeof frame.turn_id === "string" && frame.turn_id.trim()
            ? frame.turn_id
            : null);
        if (turnId) {
          if (pendingClientTurnIdRef.current === turnId) {
            pendingClientTurnIdRef.current = null;
          }
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
          ?? (typeof frame.turn_id === "string" && frame.turn_id.trim()
            ? frame.turn_id
            : activeTurnIdRef.current);
        pendingClientTurnIdRef.current = null;
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
          ?? (typeof frame.turn_id === "string" && frame.turn_id.trim()
            ? frame.turn_id
            : null);
        if (turnId && streamTextRef.current.trim()) {
          if (pendingClientTurnIdRef.current === turnId) {
            activeTurnIdRef.current = turnId;
            pendingClientTurnIdRef.current = null;
          }
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
      case "assistant.message": {
        const turnId =
          (typeof frame.turn_id === "string" && frame.turn_id.trim()
            ? frame.turn_id
            : null);
        if (turnId && cancelledTurnIdsRef.current.has(turnId)) break;
        setMessages((current) =>
          upsertServerAssistantMessage(
            current,
            frame.message,
            turnId ?? undefined,
          ),
        );
        if (
          turnId
          && (
            turnId === activeTurnIdRef.current
            || turnId === pendingClientTurnIdRef.current
          )
        ) {
          markTurnInactive(turnId);
        }
        break;
      }
      case "tool.call":
        if (
          typeof frame.turn_id === "string"
          && cancelledTurnIdsRef.current.has(frame.turn_id)
        ) {
          break;
        }
        if (
          typeof frame.turn_id === "string"
          && pendingClientTurnIdRef.current === frame.turn_id
        ) {
          activeTurnIdRef.current = frame.turn_id;
          pendingClientTurnIdRef.current = null;
        }
        if (showToolEventsRef.current || shouldPreserveToolMessage(frame)) {
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
          if (pendingClientTurnIdRef.current === frame.turn_id) {
            pendingClientTurnIdRef.current = null;
          }
          markTurnActive(frame.turn_id);
        } else {
          setBusy(true);
        }
        if (showToolEventsRef.current || shouldPreserveToolMessage(frame)) {
          setMessages((current) => upsertToolMessage(current, frame.type, frame));
        }
        break;
      case "chat.done": {
        const doneTurnId = typeof frame.turn_id === "string"
          ? frame.turn_id.trim()
          : "";
        if (
          doneTurnId
          && cancelledTurnIdsRef.current.has(doneTurnId)
        ) {
          setMessages((current) => settleRunningToolMessages(
            current,
            doneTurnId,
            "未执行：本轮已取消",
          ));
          cancelledTurnIdsRef.current.delete(doneTurnId);
          markTurnInactive(doneTurnId);
          break;
        }
        if (
          doneTurnId
          && recentlyCompletedTurnIdRef.current === doneTurnId
        ) {
          break;
        }
        if (doneTurnId) {
          setMessages((current) => settleRunningToolMessages(current, doneTurnId));
        }
        finalizeStream();
        break;
      }
      case "project.created":
        setMessages((current) => appendToolMessage(current, frame.type, frame));
        break;
      case "error":
        setError(typeof frame.message === "string" ? frame.message : "聊天发生未知错误");
        if (
          typeof frame.message === "string"
          && frame.message.includes("当前用户已有 AI 对话正在处理中")
        ) {
          setBusy(true);
          break;
        }
        {
          const failedTurnId = activeTurnIdRef.current ?? pendingClientTurnIdRef.current;
          if (failedTurnId) {
            setMessages((current) => settleRunningToolMessages(
              current,
              failedTurnId,
              "未执行：本轮因错误结束",
            ));
          }
          markTurnInactive(failedTurnId);
        }
        setConnecting(false);
        break;
      default:
        break;
    }
  }, [
    activeTurnIdRef,
    cancelledTurnIdsRef,
    desiredScope,
    finalizeStream,
    markTurnActive,
    markTurnInactive,
    messagesRef,
    pendingClientTurnIdRef,
    recentlyCompletedTurnIdRef,
    setBusy,
    setConnected,
    setConnecting,
    setError,
    setHistoryReady,
    setConversations,
    setDecisions,
    setDeletedIds,
    setMessages,
    setActiveModel,
    setModelsLoading,
    setPinnedIds,
    setSlashCommands,
    setStreamText,
    streamTextRef,
  ]);
}
