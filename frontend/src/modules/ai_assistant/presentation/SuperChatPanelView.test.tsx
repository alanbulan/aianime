// Copyright (c) 2026 AI anime
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ai_assistant/presentation/ChatComposer", () => ({
  ChatComposer: ({
    isFreezoneLayout,
  }: {
    isFreezoneLayout: boolean;
  }) => (
    <div data-testid="composer" data-freezone={isFreezoneLayout} />
  ),
}));

vi.mock("@/modules/ai_assistant/presentation/ChatMessageArea", () => ({
  ChatMessageArea: ({
    isFreezoneLayout,
  }: {
    isFreezoneLayout: boolean;
  }) => (
    <div data-testid="message-area" data-freezone={isFreezoneLayout} />
  ),
}));

vi.mock("@/modules/ai_assistant/presentation/ChatPanelDetailOverlays", () => ({
  ChatPanelDetailOverlays: () => <div data-testid="detail-overlays" />,
}));

vi.mock("@/modules/ai_assistant/presentation/ChatPanelContextViews", () => ({
  ChatPanelContextViews: () => <div data-testid="context-views" />,
}));

vi.mock("@/modules/ai_assistant/presentation/ChatPanelHeader", () => ({
  ChatPanelHeader: ({
    isFreezoneLayout,
  }: {
    isFreezoneLayout: boolean;
  }) => (
    <div data-testid="panel-header" data-freezone={isFreezoneLayout} />
  ),
}));

import {
  SuperChatPanelView,
  type SuperChatPanelViewProps,
} from "./SuperChatPanelView";

function viewProps(
  overrides: Partial<SuperChatPanelViewProps> = {},
): SuperChatPanelViewProps {
  return {
    composer: {
      attachments: [],
      busy: false,
      canSend: false,
      connected: true,
      draft: "",
      draftInputRef: createRef<HTMLTextAreaElement>(),
      dragFileState: null,
      fileInputRef: createRef<HTMLInputElement>(),
      fileUploadEnabled: false,
      queuedMessages: [],
      recording: false,
      transcribing: false,
      selectedHistoryMessageIndex: null,
      selectedQueuedMessageId: null,
      shellRef: createRef<HTMLDivElement>(),
      showWaitingIndicator: false,
      onAbort: vi.fn(),
      onAddFiles: vi.fn(),
      onAttachmentRemove: vi.fn(),
      onDragEnter: vi.fn(),
      onDragLeave: vi.fn(),
      onDragOver: vi.fn(),
      onDraftChange: vi.fn(),
      onDraftFocusChange: vi.fn(),
      onDropFiles: vi.fn(() => false),
      onHistorySelect: vi.fn(() => false),
      onOpenFilePicker: vi.fn(),
      onQueueOffset: vi.fn(),
      onQueueRemove: vi.fn(),
      onQueueSelect: vi.fn(),
      onResetHistorySelection: vi.fn(),
      onSubmit: vi.fn(),
      onToggleSpeech: vi.fn(),
    },
    conversationDrawer: null,
    contextViews: {
      approvals: [],
      error: null,
      pinnedMessages: [],
      searchOpen: false,
      searchQuery: "",
      onClearPinned: vi.fn(),
      onResolveApproval: vi.fn(),
      onSearchChange: vi.fn(),
      onSearchClose: vi.fn(),
      onTogglePin: vi.fn(),
    },
    detailOverlays: {
      detailMessage: null,
      formatCheck: null,
      formatCheckOpen: false,
      mediaDetail: null,
      onClearFormatCheckDetails: vi.fn(),
      onCloseDetail: vi.fn(),
      onCloseMedia: vi.fn(),
      onOpenMedia: vi.fn(),
    },
    header: {
      chat: {
        activeModel: null,
        busy: false,
        connected: true,
        connecting: false,
        error: null,
        models: [],
        modelsLoading: false,
        relayInstances: [],
        selectedInstanceId: "",
        selectRelayInstance: vi.fn(),
        setSettings: vi.fn(),
        settings: {
          showStructuredSourceWhileStreaming: false,
          showToolEvents: false,
        },
        switchModel: vi.fn(),
      },
    },
    isFreezoneLayout: false,
    messageArea: {
      busy: false,
      connected: true,
      connecting: false,
      currentStreamingAssistantId: null,
      deferStructuredRender: false,
      historyReady: true,
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
    },
    ...overrides,
  };
}

describe("SuperChat panel view", () => {
  it("keeps the panel layout order and background asset", () => {
    const { container } = render(<SuperChatPanelView {...viewProps()} />);
    const root = container.firstElementChild;
    const section = container.querySelector("section");

    expect(root).toHaveClass("bg-background");
    expect(root).not.toHaveClass("bg-transparent");
    expect(
      Array.from(section?.children ?? []).map((child) =>
        child.getAttribute("data-testid"),
      ),
    ).toEqual([
      "panel-header",
      "context-views",
      "message-area",
      "composer",
    ]);
    expect(screen.getByTestId("detail-overlays")).toBeInTheDocument();
    expect(
      container.querySelector('img[src="/images/bg-chat-buttom.png"]'),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("applies the freezone layout to the shell and layout-sensitive children", () => {
    const { container } = render(
      <SuperChatPanelView {...viewProps({ isFreezoneLayout: true })} />,
    );

    expect(container.firstElementChild).toHaveClass("bg-transparent");
    expect(screen.getByTestId("panel-header")).toHaveAttribute(
      "data-freezone",
      "true",
    );
    expect(screen.getByTestId("message-area")).toHaveAttribute(
      "data-freezone",
      "true",
    );
    expect(screen.getByTestId("composer")).toHaveAttribute(
      "data-freezone",
      "true",
    );
  });
});
