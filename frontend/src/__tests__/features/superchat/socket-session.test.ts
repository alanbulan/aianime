// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSuperChatSocketSession } from "@/features/superchat/socket-session";

type SessionOptions = Parameters<typeof createSuperChatSocketSession>[0];

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  readonly closeCalls: Array<{ code?: number; reason?: string }> = [];
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.closeCalls.push({ code, reason });
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  receive(data: unknown): void {
    this.onmessage?.({ data });
  }

  fail(): void {
    this.onerror?.(new Event("error"));
  }

  closeFromServer(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function sessionOptions(overrides: Partial<SessionOptions> = {}): SessionOptions {
  return {
    scope: { kind: "project", id: "project-a" },
    onFrame: vi.fn(),
    hasActiveTurn: vi.fn(() => false),
    onConnectedChange: vi.fn(),
    onConnectingChange: vi.fn(),
    onErrorChange: vi.fn(),
    onActiveTurnDisconnect: vi.fn(),
    ...overrides,
  };
}

describe("SuperChat socket session", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("connects to the chat endpoint and requests the configured scope on open", () => {
    const options = sessionOptions();
    const session = createSuperChatSocketSession(options);
    const expectedUrl = new URL("/api/v1/chat/ws", window.location.origin);
    expectedUrl.protocol = expectedUrl.protocol === "https:" ? "wss:" : "ws:";

    session.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();

    expect(socket.url).toBe(expectedUrl.toString());
    expect(socket.sent).toEqual([
      JSON.stringify({ type: "scope.set", scope: options.scope }),
    ]);
    expect(options.onConnectingChange).toHaveBeenCalledWith(true);
    expect(options.onErrorChange).toHaveBeenCalledWith(null);
  });

  it("sends client frames only while the current socket is open", () => {
    const session = createSuperChatSocketSession(sessionOptions());
    session.connect();
    const socket = FakeWebSocket.instances[0];
    const frame = { type: "scope.set", scope: { kind: "home", id: null } } as const;

    session.send(frame);
    expect(socket.sent).toEqual([]);

    socket.open();
    session.send(frame);
    expect(socket.sent).toHaveLength(2);
    expect(socket.sent[1]).toBe(JSON.stringify(frame));
  });

  it("dispatches valid server frames and ignores malformed development payloads", () => {
    const options = sessionOptions();
    const session = createSuperChatSocketSession(options);
    session.connect();
    const socket = FakeWebSocket.instances[0];

    socket.receive(JSON.stringify({ type: "chat.ping", turn_id: "turn-1" }));
    socket.receive("{not json");

    expect(options.onFrame).toHaveBeenCalledTimes(1);
    expect(options.onFrame).toHaveBeenCalledWith({
      type: "chat.ping",
      turn_id: "turn-1",
    });
  });

  it("reports socket errors without throwing", () => {
    const options = sessionOptions();
    const session = createSuperChatSocketSession(options);
    session.connect();

    FakeWebSocket.instances[0].fail();

    expect(options.onErrorChange).toHaveBeenLastCalledWith("WebSocket connection failed");
    expect(options.onConnectingChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps an active turn busy and reconnects after an unexpected close", () => {
    const options = sessionOptions({ hasActiveTurn: vi.fn(() => true) });
    const session = createSuperChatSocketSession(options);
    session.connect();

    FakeWebSocket.instances[0].closeFromServer(1006);

    expect(options.onConnectedChange).toHaveBeenCalledWith(false);
    expect(options.onConnectingChange).toHaveBeenLastCalledWith(true);
    expect(options.onActiveTurnDisconnect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1199);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("closes an unauthorized session without reconnecting", () => {
    const options = sessionOptions();
    const session = createSuperChatSocketSession(options);
    session.connect();
    const socket = FakeWebSocket.instances[0];

    socket.receive(JSON.stringify({ type: "error", message: "unauthorized" }));
    expect(options.onFrame).toHaveBeenCalledWith({
      type: "error",
      message: "unauthorized",
    });
    expect(socket.closeCalls).toHaveLength(1);

    socket.closeFromServer(1000);
    vi.advanceTimersByTime(1200);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("disconnects explicitly without leaving handlers or reconnect timers", () => {
    const options = sessionOptions();
    const session = createSuperChatSocketSession(options);
    session.connect();
    const socket = FakeWebSocket.instances[0];

    session.disconnect();

    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onerror).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(options.onConnectedChange).toHaveBeenLastCalledWith(false);
    expect(options.onConnectingChange).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(1200);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
