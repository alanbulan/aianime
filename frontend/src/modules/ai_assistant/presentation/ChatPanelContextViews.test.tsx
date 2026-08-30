// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ai_assistant/presentation/ApprovalCard", () => ({
  ApprovalCard: ({
    approval,
    onResolve,
  }: {
    approval: { id: string; title: string };
    onResolve: (decision: "deny") => void;
  }) => (
    <button
      type="button"
      data-testid={`approval-${approval.id}`}
      onClick={() => onResolve("deny")}
    >
      {approval.title}
    </button>
  ),
}));

vi.mock("@/modules/ai_assistant/presentation/DecisionCard", () => ({
  DecisionCard: ({
    decision,
    submitting,
    onSubmit,
  }: {
    decision: { id: string; title: string };
    submitting: boolean;
    onSubmit: (answers: Array<{ question_id: string; option_id: string }>) => void;
  }) => (
    <button
      type="button"
      data-testid={`decision-${decision.id}`}
      data-submitting={String(submitting)}
      onClick={() => onSubmit([{ question_id: "resolution", option_id: "1080p" }])}
    >
      {decision.title}
    </button>
  ),
}));

vi.mock("@/modules/ai_assistant/presentation/PinnedPanel", () => ({
  PinnedPanel: ({
    messages,
    onClear,
    onTogglePin,
  }: {
    messages: Array<{ id: string }>;
    onClear: () => void;
    onTogglePin: (messageId: string) => void;
  }) => (
    <div data-testid="pinned-panel" data-count={messages.length}>
      <button type="button" onClick={onClear}>clear pinned</button>
      {messages[0] && (
        <button type="button" onClick={() => onTogglePin(messages[0].id)}>
          unpin first
        </button>
      )}
    </div>
  ),
}));

vi.mock("@/modules/ai_assistant/presentation/SearchBar", () => ({
  SearchBar: ({
    query,
    onChange,
    onClose,
  }: {
    query: string;
    onChange: (query: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="search-bar">
      <input
        aria-label="search query"
        value={query}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" onClick={onClose}>close search</button>
    </div>
  ),
}));

import type {
  ApprovalRequest,
  ChatMessage,
  DecisionRequest,
} from "@/modules/ai_assistant/domain/contracts";

import { ChatPanelContextViews } from "./ChatPanelContextViews";

const approval: ApprovalRequest = {
  id: "approval-1",
  kind: "exec",
  title: "Run command",
};

const pinnedMessage: ChatMessage = {
  id: "message-1",
  role: "assistant",
  text: "Pinned message",
  timestamp: 1,
};

const decision: DecisionRequest = {
  id: "decision-1",
  title: "生成前确认",
  source: "question",
  status: "pending",
  questions: [
    {
      id: "resolution",
      header: "分辨率",
      question: "请选择分辨率",
      options: [
        { id: "1080p", label: "1080p", description: "高清" },
        { id: "720p", label: "720p", description: "均衡" },
      ],
    },
  ],
};

function baseProps() {
  return {
    approvals: [] as ApprovalRequest[],
    decisions: [] as DecisionRequest[],
    submittingDecisionIds: new Set<string>(),
    error: null,
    pinnedMessages: [] as ChatMessage[],
    searchOpen: false,
    searchQuery: "",
    onClearPinned: vi.fn(),
    onResolveApproval: vi.fn(),
    onResolveDecision: vi.fn(),
    onSearchChange: vi.fn(),
    onSearchClose: vi.fn(),
    onTogglePin: vi.fn(),
  };
}

describe("SuperChat panel context views", () => {
  it("keeps optional error, approval, and search views hidden", () => {
    render(<ChatPanelContextViews {...baseProps()} />);

    expect(screen.queryByTestId("approval-approval-1")).toBeNull();
    expect(screen.queryByTestId("search-bar")).toBeNull();
    expect(screen.getByTestId("pinned-panel")).toHaveAttribute(
      "data-count",
      "0",
    );
  });

  it("renders context and forwards every action", () => {
    const props = {
      ...baseProps(),
      approvals: [approval],
      decisions: [decision],
      submittingDecisionIds: new Set([decision.id]),
      error: "transport error",
      pinnedMessages: [pinnedMessage],
      searchOpen: true,
      searchQuery: "shot",
    };
    render(<ChatPanelContextViews {...props} />);

    expect(screen.getByText("transport error")).toBeInTheDocument();
    expect(screen.getByTestId("pinned-panel")).toHaveAttribute(
      "data-count",
      "1",
    );
    expect(screen.getByRole("textbox", { name: "search query" })).toHaveValue(
      "shot",
    );

    fireEvent.click(screen.getByTestId("approval-approval-1"));
    fireEvent.click(screen.getByTestId("decision-decision-1"));
    fireEvent.click(screen.getByRole("button", { name: "clear pinned" }));
    fireEvent.click(screen.getByRole("button", { name: "unpin first" }));
    fireEvent.change(screen.getByRole("textbox", { name: "search query" }), {
      target: { value: "scene" },
    });
    fireEvent.click(screen.getByRole("button", { name: "close search" }));

    expect(props.onResolveApproval).toHaveBeenCalledWith(approval, "deny");
    expect(props.onResolveDecision).toHaveBeenCalledWith(
      decision,
      [{ question_id: "resolution", option_id: "1080p" }],
    );
    expect(screen.getByTestId("decision-decision-1")).toHaveAttribute(
      "data-submitting",
      "true",
    );
    expect(props.onClearPinned).toHaveBeenCalledTimes(1);
    expect(props.onTogglePin).toHaveBeenCalledWith("message-1");
    expect(props.onSearchChange).toHaveBeenCalledWith("scene");
    expect(props.onSearchClose).toHaveBeenCalledTimes(1);
  });
});
