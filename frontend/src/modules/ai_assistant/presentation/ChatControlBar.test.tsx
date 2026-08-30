// Copyright (c) 2026 AI anime
import { getByUiTooltip } from "@/__tests__/helpers/ui-tooltip-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import {
  ChatPanelActions,
  ControlBar,
} from "./ChatControlBar";

function chatModel(overrides: Record<string, unknown> = {}) {
  return {
    activeModel: "model-a",
    busy: false,
    connected: true,
    connecting: false,
    error: null,
    models: [
      { id: "model-a", label: "Standard" },
      { id: "model-b", label: "Reasoning", reasoning: true },
    ],
    modelsLoading: false,
    relayInstances: [
      { instanceId: "runner-a", instanceName: "Runner A" },
      { instanceId: "runner-b", instanceName: "Runner B", busy: true },
    ],
    selectedInstanceId: "runner-a",
    selectRelayInstance: vi.fn(),
    setSettings: vi.fn(),
    settings: {
      showToolEvents: false,
      showStructuredSourceWhileStreaming: false,
    },
    switchModel: vi.fn(),
    ...overrides,
  };
}

describe("SuperChat control bar", () => {
  afterEach(() => {
    toastSuccess.mockReset();
  });

  it("renders transport state and forwards instance selection", async () => {
    const user = userEvent.setup();
    const chat = chatModel();
    render(<ControlBar chat={chat} />);

    expect(screen.getByText("aiAssistant.connected")).toBeInTheDocument();
    expect(screen.getByText("aiAssistant.backendTransport")).toBeInTheDocument();
    expect(screen.getByText("Runner A")).toBeInTheDocument();
    await user.click(getByUiTooltip("aiAssistant.instance"));
    const runnerOption = screen.getByRole("option", { name: "Runner B *" });
    expect(runnerOption).toBeInTheDocument();
    await user.click(runnerOption);
    fireEvent.click(
      screen.getByRole("button", {
        name: "aiAssistant.showStructuredSourceWhileStreaming",
      }),
    );

    expect(chat.selectRelayInstance).toHaveBeenCalledWith("runner-b");
    expect(chat.setSettings).toHaveBeenCalledWith({
      showStructuredSourceWhileStreaming: true,
    });
  });

  it("forwards search and settings toggles", () => {
    const onToggleSearch = vi.fn();
    const onToggleSessions = vi.fn();
    const chat = chatModel();
    render(
      <ChatPanelActions
        chat={chat}
        searchOpen
        onToggleSessions={onToggleSessions}
        onToggleSearch={onToggleSearch}
      />,
    );

    const search = screen.getByRole("button", { name: "aiAssistant.search" });
    const tools = screen.getByRole("button", {
      name: "aiAssistant.showToolEvents",
    });
    expect(search).toHaveClass("text-primary");
    expect(tools).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(search);
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.expandSessions" }),
    );
    fireEvent.click(tools);

    expect(onToggleSearch).toHaveBeenCalledTimes(1);
    expect(onToggleSessions).toHaveBeenCalledTimes(1);
    expect(chat.setSettings).toHaveBeenNthCalledWith(1, {
      showToolEvents: true,
    });
    expect(toastSuccess).toHaveBeenCalledWith("aiAssistant.toolEventsShown");
  });

  it("projects reconnecting state and keeps compact controls minimal", () => {
    const chat = chatModel({
      busy: true,
      connected: false,
      error: "transport unavailable",
    });
    const { rerender } = render(<ControlBar chat={chat} />);

    expect(screen.getByText("aiAssistant.reconnecting").parentElement).toHaveAttribute(
      "data-ui-tooltip",
      "transport unavailable",
    );

    rerender(
      <ControlBar chat={chat} compact />,
    );
    expect(screen.queryByText("aiAssistant.reconnecting")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "aiAssistant.showStructuredSourceWhileStreaming",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "aiAssistant.showToolEvents" }),
    ).toBeNull();
    expect(screen.queryByLabelText("aiAssistant.model")).toBeNull();
  });
});
