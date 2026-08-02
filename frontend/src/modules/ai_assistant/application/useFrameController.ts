// Copyright (c) 2026 AI anime
import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import { currentTurnIsLive } from "@/modules/ai_assistant/domain/activeTurn";
import type {
  ChatMessage,
  ChatScope,
  ServerFrame,
} from "@/modules/ai_assistant/domain/contracts";
import {
  isChatScope,
  scopeMatches,
} from "@/modules/ai_assistant/domain/scope";
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
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
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
  setMessages,
  setBusy,
  setStreamText,
  markTurnActive,
  markTurnInactive,
  finalizeStream,
}: FrameControllerOptions): (frame: ServerFrame) => void {
  return useCallback((frame: ServerFrame) => {
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
          const preserveRemoteBusy = frame.busy === true
            && currentTurnIsLive(protectedTurnId, current);
          return mergeHistorySnapshot(
            current,
            history,
            protectedTurnId,
            preserveRemoteBusy,
          );
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
        if (showToolEvents || shouldPreserveToolMessage(frame)) {
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
        if (showToolEvents || shouldPreserveToolMessage(frame)) {
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
        if (
          typeof frame.message === "string"
          && frame.message.includes("当前用户已有 AI 对话正在处理中")
        ) {
          setBusy(true);
          break;
        }
        markTurnInactive(activeTurnIdRef.current ?? pendingClientTurnIdRef.current);
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
    setMessages,
    setStreamText,
    showToolEvents,
    streamTextRef,
  ]);
}
