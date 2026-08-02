// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import {
  ControlBar,
  HeaderControlPortal,
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
    document.getElementById("superchat-header-controls")?.remove();
  });

  it("renders transport state and forwards instance and model selection", () => {
    const chat = chatModel();
    render(
      <ControlBar
        chat={chat}
        searchOpen={false}
        onToggleSearch={vi.fn()}
      />,
    );

    expect(screen.getByText("aiAssistant.connected")).toBeInTheDocument();
    expect(screen.getByText("aiAssistant.backendTransport")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Runner B *" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Reasoning +" })).toBeInTheDocument();

    fireEvent.change(screen.getByTitle("aiAssistant.instance"), {
      target: { value: "runner-b" },
    });
    fireEvent.change(screen.getByTitle("aiAssistant.model"), {
      target: { value: "model-b" },
    });

    expect(chat.selectRelayInstance).toHaveBeenCalledWith("runner-b");
    expect(chat.switchModel).toHaveBeenCalledWith("model-b");
  });

  it("forwards search and settings toggles", () => {
    const onToggleSearch = vi.fn();
    const chat = chatModel();
    render(
      <ControlBar
        chat={chat}
        searchOpen
        onToggleSearch={onToggleSearch}
      />,
    );

    const search = screen.getByRole("button", { name: "aiAssistant.search" });
    const tools = screen.getByRole("button", {
      name: "aiAssistant.showToolEvents",
    });
    const structured = screen.getByRole("button", {
      name: "aiAssistant.showStructuredSourceWhileStreaming",
    });
    expect(search).toHaveClass("text-primary");
    expect(tools).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(search);
    fireEvent.click(tools);
    fireEvent.click(structured);

    expect(onToggleSearch).toHaveBeenCalledTimes(1);
    expect(chat.setSettings).toHaveBeenNthCalledWith(1, {
      showToolEvents: true,
    });
    expect(chat.setSettings).toHaveBeenNthCalledWith(2, {
      showStructuredSourceWhileStreaming: true,
    });
  });

  it("projects reconnecting state and keeps compact controls minimal", () => {
    const chat = chatModel({
      busy: true,
      connected: false,
      error: "transport unavailable",
    });
    const { rerender } = render(
      <ControlBar
        chat={chat}
        searchOpen={false}
        onToggleSearch={vi.fn()}
      />,
    );

    expect(screen.getByText("aiAssistant.reconnecting").parentElement).toHaveAttribute(
      "title",
      "transport unavailable",
    );

    rerender(
      <ControlBar
        chat={chat}
        compact
        searchOpen={false}
        onToggleSearch={vi.fn()}
      />,
    );
    expect(screen.queryByText("aiAssistant.reconnecting")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "aiAssistant.showStructuredSourceWhileStreaming",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "aiAssistant.showToolEvents" }),
    ).toBeInTheDocument();
  });

  it("mounts compact controls into the desktop header portal", async () => {
    const target = document.createElement("div");
    target.id = "superchat-header-controls";
    document.body.appendChild(target);

    render(
      <HeaderControlPortal
        chat={chatModel()}
        searchOpen={false}
        onToggleSearch={vi.fn()}
      />,
    );

    expect(
      await within(target).findByRole("button", { name: "aiAssistant.search" }),
    ).toBeInTheDocument();
    expect(within(target).queryByText("aiAssistant.connected")).toBeNull();
  });
});
