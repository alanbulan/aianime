// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/modules/ai_assistant/presentation/ChatControlBar", () => ({
  ControlBar: () => (
    <button type="button" data-testid="control-bar">
      control bar
    </button>
  ),
}));

import { ChatPanelHeader } from "./ChatPanelHeader";
import type { ChatControlBarModel } from "./ChatControlBar";

function chatModel(
  overrides: Partial<ChatControlBarModel> = {},
): ChatControlBarModel {
  return {
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
    ...overrides,
  };
}

describe("SuperChat panel header", () => {
  it("does not mount chat controls into the desktop header", () => {
    const { container } = render(
      <ChatPanelHeader
        chat={chatModel()}
        isFreezoneLayout={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders freezone status, controls, and the optional close action", () => {
    const onRequestClose = vi.fn();
    render(
      <ChatPanelHeader
        chat={chatModel()}
        isFreezoneLayout
        onRequestClose={onRequestClose}
      />,
    );

    expect(screen.getByText("freezone.chat.title")).toBeInTheDocument();
    expect(screen.getByText("aiAssistant.connected")).toBeInTheDocument();
    expect(screen.getByTestId("control-bar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "freezone.chat.close" }));
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("projects reconnecting and disconnected freezone states", () => {
    const { rerender } = render(
      <ChatPanelHeader
        chat={chatModel({ connected: false, connecting: true })}
        isFreezoneLayout
      />,
    );
    expect(screen.getByText("aiAssistant.reconnecting")).toBeInTheDocument();

    rerender(
      <ChatPanelHeader
        chat={chatModel({ connected: false })}
        isFreezoneLayout
      />,
    );
    expect(screen.getByText("aiAssistant.disconnected")).toBeInTheDocument();
  });
});
