// Copyright (c) 2026 AI anime
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/modules/ai_assistant/presentation/ChatTimeline", () => ({
  ChatTimeline: ({
    activeTurnId,
    messages,
    onSelectTurn,
  }: {
    activeTurnId: string | null;
    messages: unknown[];
    onSelectTurn: (turnId: string) => void;
  }) => (
    <button
      type="button"
      data-testid="timeline"
      data-active-turn-id={activeTurnId ?? ""}
      data-count={messages.length}
      onClick={() => onSelectTurn("user-3")}
    />
  ),
}));

vi.mock("@/modules/ai_assistant/presentation/ChatMessageView", () => ({
  DotsIndicator: () => <span data-testid="dots" />,
  ToolExecutionList: ({ messages }: { messages: Array<{
    id: string;
    toolState?: string;
    toolError?: unknown;
  }> }) => (
    <div
      data-testid="tool-list"
      data-count={messages.length}
      data-states={messages.map((message) => message.toolState).join(",")}
      data-errors={messages.map((message) => String(message.toolError ?? "")).join(",")}
    />
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
import {
  useTaskCenterStore,
  type TaskState,
  type TaskStatus,
} from "@/modules/task_execution/public";
import { ChatMessageArea } from "./ChatMessageArea";

const originalOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetWidth",
);
const originalOffsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetHeight",
);
const originalScrollTo = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollTo",
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 760,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 600,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  if (originalOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
  }
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
  }
  if (originalScrollTo) {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
});

type MessageAreaProps = Parameters<typeof ChatMessageArea>[0];

function message(id: string, role: ChatMessage["role"], text: string): ChatMessage {
  return { id, role, text, timestamp: 1 };
}

function task(taskKey: string, status: TaskStatus, error: string | null = null): TaskState {
  return {
    task_key: taskKey,
    task_id: `${taskKey}-id`,
    task_type: "production_workflow",
    username: "tester",
    project: "project",
    project_id: "project-id",
    episode: 1,
    beat_num: null,
    scope: null,
    status,
    progress: status === "completed" ? 1 : 0.5,
    current_task: "等待任务完成",
    result: status === "completed" ? { ok: true } : null,
    error,
    logs: [],
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:01:00Z",
    completed_at: status === "running" ? "" : "2026-08-25T00:01:00Z",
  };
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
  beforeEach(() => {
    useTaskCenterStore.getState().reset();
  });

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

  it("keeps separated tool groups from the same turn keyed independently", () => {
    const first = message("tool-1", "tool", "读取数据");
    const second = message("tool-2", "tool", "提交任务");
    first.turnId = "turn-1";
    second.turnId = "turn-1";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<ChatMessageArea {...props({
      totalMessageCount: 3,
      visibleMessages: [
        first,
        message("assistant-1", "assistant", "处理中"),
        second,
      ],
    })} />);

    expect(screen.getAllByTestId("tool-list")).toHaveLength(2);
    expect(
      consoleError.mock.calls.some((args) =>
        args.some((value) => String(value).includes("same key")),
      ),
    ).toBe(false);
    consoleError.mockRestore();
  });

  it("reconciles interrupted wait calls with the authoritative task state", () => {
    const running = message("tool-running", "tool", "等待任务完成");
    running.turnId = "turn-1";
    running.toolName = "ai_anime_wait_task";
    running.toolState = "error";
    running.toolError = "未执行：本轮已结束，工具未返回结果";
    running.toolInput = { task_key: "task-running" };
    const failed = {
      ...running,
      id: "tool-failed",
      toolInput: { task_key: "task-failed" },
    };
    const completed = {
      ...running,
      id: "tool-completed",
      toolInput: { task_key: "task-completed" },
    };
    useTaskCenterStore.setState({
      tasks: new Map([
        ["task-running", task("task-running", "running")],
        ["task-failed", task("task-failed", "failed", "服务重启，任务已中断")],
        ["task-completed", task("task-completed", "completed")],
      ]),
    });

    render(<ChatMessageArea {...props({
      totalMessageCount: 3,
      visibleMessages: [running, failed, completed],
    })} />);

    expect(screen.getByTestId("tool-list")).toHaveAttribute(
      "data-states",
      "pending,error,success",
    );
    expect(screen.getByTestId("tool-list")).toHaveAttribute(
      "data-errors",
      ",服务重启，任务已中断,",
    );
  });

  it("keeps a bounded number of message rows mounted for long conversations", () => {
    const messages = Array.from({ length: 200 }, (_, index) =>
      message(`user-${index}`, "user", `消息 ${index}`),
    );

    render(<ChatMessageArea {...props({
      totalMessageCount: messages.length,
      visibleMessages: messages,
    })} />);

    const renderedRows = screen.getAllByTestId(/^bubble-user-/);
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(messages.length);
  });

  it("keeps the clicked timeline turn selected instead of highlighting a lower turn", () => {
    const scrollRef = createRef<HTMLDivElement>();
    const messages = [
      message("user-1", "user", "第一条"),
      message("user-2", "user", "第二条"),
      message("user-3", "user", "第三条"),
      message("user-4", "user", "第四条"),
    ];

    render(<ChatMessageArea {...props({
      scrollRef,
      totalMessageCount: messages.length,
      visibleMessages: messages,
    })} />);

    fireEvent.click(screen.getByTestId("timeline"));
    expect(screen.getByTestId("timeline")).toHaveAttribute(
      "data-active-turn-id",
      "user-3",
    );

    fireEvent.wheel(scrollRef.current as HTMLDivElement);
    expect(screen.getByTestId("timeline")).not.toHaveAttribute(
      "data-active-turn-id",
      "user-3",
    );
  });
});
