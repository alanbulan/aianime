// Copyright (c) 2026 AI anime
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/modules/ai_assistant/presentation/ChatTimeline", () => ({
  ChatTimeline: ({ messages }: { messages: unknown[] }) => (
    <div data-testid="timeline" data-count={messages.length} />
  ),
}));

vi.mock("@/modules/ai_assistant/presentation/ChatMessageView", () => ({
  DotsIndicator: () => <span data-testid="dots" />,
  ToolExecutionList: ({ messages }: { messages: Array<{ id: string }> }) => (
    <div data-testid="tool-list" data-count={messages.length} />
  ),
  MessageBubble: ({
    message,
    pinned,
    deferStructuredRender,
    streaming,
    onOpenDetail,
    onOpenMedia,
  }: {
    message: { id: string; text: string };
    pinned: boolean;
    deferStructuredRender: boolean;
    streaming: boolean;
    onOpenDetail: (message: unknown) => void;
    onOpenMedia: (detail: unknown) => void;
  }) => (
    <button
      type="button"
      data-testid={`bubble-${message.id}`}
      data-pinned={pinned}
      data-deferred={deferStructuredRender}
      data-streaming={streaming}
      onClick={() => {
        onOpenDetail(message);
        onOpenMedia({ kind: "image", src: "/detail.png" });
      }}
    >
      {message.text}
    </button>
  ),
}));

import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import { ChatMessageArea } from "./ChatMessageArea";

type MessageAreaProps = Parameters<typeof ChatMessageArea>[0];

function message(id: string, role: ChatMessage["role"], text: string): ChatMessage {
  return { id, role, text, timestamp: 1 };
}

function props(overrides: Partial<MessageAreaProps> = {}): MessageAreaProps {
  return {
    busy: false,
    connected: false,
    connecting: false,
    currentStreamingAssistantId: null,
    deferStructuredRender: false,
    historyReady: true,
    isFreezoneLayout: false,
    messageListRef: createRef<HTMLDivElement>(),
    pinnedIds: new Set(),
    scrollRef: createRef<HTMLDivElement>(),
    showScrollToBottom: false,
    showWaitingIndicator: false,
    streamText: "",
    streamTextAlreadyRendered: false,
    streamingAssistantId: null,
    totalMessageCount: 0,
    variant: "default",
    visibleMessages: [],
    onDeleteMessage: vi.fn(),
    onOpenDetail: vi.fn(),
    onOpenMedia: vi.fn(),
    onScrollToBottom: vi.fn(),
    onTogglePin: vi.fn(),
    ...overrides,
  };
}

describe("SuperChat message area", () => {
  it("switches between connecting, history sync, and empty states", () => {
    const { rerender } = render(
      <ChatMessageArea {...props({ historyReady: false, connecting: true })} />,
    );
    expect(screen.getByText("aiAssistant.connecting")).toBeInTheDocument();
    expect(screen.getByTestId("dots")).toBeInTheDocument();

    rerender(
      <ChatMessageArea {...props({ historyReady: false, connected: true })} />,
    );
    expect(
      screen.getByText("aiAssistant.syncingHistoryTitle"),
    ).toBeInTheDocument();

    rerender(<ChatMessageArea {...props()} />);
    expect(screen.getByText("aiAssistant.emptyTitle")).toBeInTheDocument();
    expect(
      screen.getByText("aiAssistant.emptyDescription"),
    ).toBeInTheDocument();
  });

  it("projects message flags and the transient streaming bubble", () => {
    const onOpenDetail = vi.fn();
    const onOpenMedia = vi.fn();
    const messages = [
      message("user-1", "user", "用户消息"),
      message("assistant-1", "assistant", "助手消息"),
    ];
    render(<ChatMessageArea {...props({
      busy: true,
      currentStreamingAssistantId: "assistant-1",
      deferStructuredRender: true,
      pinnedIds: new Set(["assistant-1"]),
      streamText: "流式消息",
      streamingAssistantId: "assistant-1",
      totalMessageCount: 2,
      visibleMessages: messages,
      onOpenDetail,
      onOpenMedia,
    })} />);

    expect(screen.getByTestId("bubble-assistant-1")).toHaveAttribute(
      "data-pinned",
      "true",
    );
    expect(screen.getByTestId("bubble-assistant-1")).toHaveAttribute(
      "data-deferred",
      "true",
    );
    expect(screen.getByTestId("bubble-assistant-1")).toHaveAttribute(
      "data-streaming",
      "true",
    );
    expect(screen.getByTestId("bubble-streaming")).toHaveAttribute(
      "data-streaming",
      "true",
    );
    expect(
      screen.getByTestId("bubble-user-1").parentElement,
    ).toHaveAttribute("data-turn-id", "user-1");

    fireEvent.click(screen.getByTestId("bubble-assistant-1"));
    expect(onOpenDetail).toHaveBeenCalledWith(messages[1]);
    expect(onOpenMedia).toHaveBeenCalledWith({
      kind: "image",
      src: "/detail.png",
    });
  });

  it("suppresses duplicate stream text and forwards scroll-to-bottom", () => {
    const onScrollToBottom = vi.fn();
    const visibleMessages = [message("user-1", "user", "消息")];
    const { rerender } = render(<ChatMessageArea {...props({
      showScrollToBottom: true,
      streamText: "已呈现",
      streamTextAlreadyRendered: true,
      totalMessageCount: 1,
      visibleMessages,
      onScrollToBottom,
    })} />);

    expect(screen.queryByTestId("bubble-streaming")).toBeNull();
    expect(screen.getByTestId("timeline")).toHaveAttribute("data-count", "1");
    fireEvent.click(screen.getByRole("button", { name: "回到底部" }));
    expect(onScrollToBottom).toHaveBeenCalledWith("auto");

    rerender(<ChatMessageArea {...props({
      isFreezoneLayout: true,
      totalMessageCount: 1,
      variant: "freezone",
      visibleMessages,
    })} />);
    expect(screen.queryByTestId("timeline")).toBeNull();
  });

  it("groups consecutive tool events from the same turn into one execution list", () => {
    const first = message("tool-1", "tool", "读取数据");
    const second = message("tool-2", "tool", "提交任务");
    first.turnId = "turn-1";
    second.turnId = "turn-1";

    render(<ChatMessageArea {...props({
      totalMessageCount: 3,
      visibleMessages: [
        message("user-1", "user", "开始处理"),
        first,
        second,
      ],
    })} />);

    expect(screen.getByTestId("tool-list")).toHaveAttribute("data-count", "2");
    expect(screen.queryByTestId("bubble-tool-1")).toBeNull();
    expect(screen.queryByTestId("bubble-tool-2")).toBeNull();
  });
});
