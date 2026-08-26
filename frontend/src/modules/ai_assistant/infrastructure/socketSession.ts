// Copyright (c) 2026 AI anime
import type {
  ChatScope,
  ClientFrame,
  ServerFrame,
} from "@/modules/ai_assistant/domain/contracts";

const RECONNECT_DELAY_MS = 1200;

type SocketSessionOptions = {
  scope: ChatScope;
  onFrame: (frame: ServerFrame) => void;
  hasActiveTurn: () => boolean;
  onConnectedChange: (connected: boolean) => void;
  onConnectingChange: (connecting: boolean) => void;
  onErrorChange: (error: string | null) => void;
  onActiveTurnDisconnect: () => void;
};

export type SuperChatSocketSession = {
  connect: () => void;
  disconnect: () => void;
  send: (frame: ClientFrame) => void;
  close: (code?: number, reason?: string) => void;
};

function resolveChatWsUrl(): string {
  const explicit = import.meta.env.VITE_SUPERCHAT_WS_URL;
  if (explicit) return explicit;

  const url = new URL("/api/v1/chat/ws", window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function isUnauthorizedFrame(frame: ServerFrame): boolean {
  return frame.type === "error" && frame.message === "unauthorized";
}

export function createSuperChatSocketSession(
  options: SocketSessionOptions,
): SuperChatSocketSession {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let closed = false;
  let authRejected = false;
  let connectionId = 0;

  function isCurrent(candidate: WebSocket, candidateId: number): boolean {
    return connectionId === candidateId && socket === candidate;
  }

  function send(frame: ClientFrame): void {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(frame));
    }
  }

  function connect(): void {
    closed = false;
    authRejected = false;
    const currentConnectionId = connectionId + 1;
    connectionId = currentConnectionId;
    options.onConnectingChange(true);
    options.onErrorChange(null);
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const previous = socket;
    if (previous) {
      previous.onopen = null;
      previous.onmessage = null;
      previous.onerror = null;
      previous.onclose = null;
      previous.close();
    }

    const nextSocket = new WebSocket(resolveChatWsUrl());
    socket = nextSocket;
    nextSocket.onopen = () => {
      if (!isCurrent(nextSocket, currentConnectionId)) return;
      send({ type: "scope.set", scope: options.scope });
    };
    nextSocket.onmessage = (event) => {
      if (!isCurrent(nextSocket, currentConnectionId)) return;
      try {
        const frame = JSON.parse(String(event.data)) as ServerFrame;
        if (isUnauthorizedFrame(frame)) {
          authRejected = true;
          closed = true;
        }
        options.onFrame(frame);
        if (isUnauthorizedFrame(frame)) {
          nextSocket.close();
        }
      } catch {
        // Ignore malformed frames from development proxies.
      }
    };
    nextSocket.onerror = () => {
      if (!isCurrent(nextSocket, currentConnectionId)) return;
      // A local-backend restart is transient and the close handler reconnects
      // automatically. Keep it in the reconnecting state instead of surfacing
      // a stale fatal-error banner while recovery is already in progress.
      options.onErrorChange(null);
      options.onConnectingChange(true);
    };
    nextSocket.onclose = (event) => {
      if (!isCurrent(nextSocket, currentConnectionId)) return;
      socket = null;
      options.onConnectedChange(false);
      const hasActiveTurn = options.hasActiveTurn();
      options.onConnectingChange(hasActiveTurn);
      if (hasActiveTurn) {
        options.onActiveTurnDisconnect();
      }
      if (!closed && !authRejected && event.code !== 1008) {
        options.onConnectingChange(true);
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
  }

  function disconnect(): void {
    closed = true;
    connectionId += 1;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const current = socket;
    if (current) {
      current.onopen = null;
      current.onmessage = null;
      current.onerror = null;
      current.onclose = null;
      current.close();
      socket = null;
    }
    options.onConnectedChange(false);
    options.onConnectingChange(false);
  }

  function close(code?: number, reason?: string): void {
    socket?.close(code, reason);
  }

  return {
    close,
    connect,
    disconnect,
    send,
  };
}
