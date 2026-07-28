// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/features/superchat/chat-message-view", () => ({
  StructuredRenderer: ({
    blocks,
    onOpenMedia,
  }: {
    blocks: unknown[];
    onOpenMedia?: (detail: {
      kind: "image";
      src: string;
      title: string;
    }) => void;
  }) => (
    <button
      type="button"
      data-testid="structured-renderer"
      data-block-count={blocks.length}
      onClick={() => onOpenMedia?.({
        kind: "image",
        src: "/detail.png",
        title: "Detail media",
      })}
    >
      structured
    </button>
  ),
}));

import { SearchBar } from "@/features/superchat/chat-search-bar";
import { MessageDetailPanel } from "@/features/superchat/message-detail-panel";
import { PinnedPanel } from "@/features/superchat/pinned-messages-panel";
import type { ChatMessage } from "@/features/superchat/types";

function message(id: string, text: string): ChatMessage {
  return { id, role: "assistant", text, timestamp: 1 };
}

describe("SuperChat search bar", () => {
  it("focuses the input and forwards text and Escape changes", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<SearchBar query="" onChange={onChange} onClose={onClose} />);

    const input = screen.getByPlaceholderText("aiAssistant.search");
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "opening shot" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onChange).toHaveBeenCalledWith("opening shot");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clears a populated query and closes from its icon actions", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <SearchBar query="shot" onChange={onChange} onClose={onClose} />,
    );
    const buttons = container.querySelectorAll("button");

    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    expect(onChange).toHaveBeenCalledWith("");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("SuperChat pinned messages panel", () => {
  it("hides its empty state and forwards clear and unpin actions", () => {
    const onClear = vi.fn();
    const onTogglePin = vi.fn();
    const { container, rerender } = render(
      <PinnedPanel messages={[]} onClear={onClear} onTogglePin={onTogglePin} />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <PinnedPanel
        messages={[message("message-1", "First result"), message("message-2", "Second result")]}
        onClear={onClear}
        onTogglePin={onTogglePin}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "First result" }));
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.clearPinned" }),
    );

    expect(onTogglePin).toHaveBeenCalledWith("message-1");
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe("SuperChat message detail panel", () => {
  it("renders nothing without a selected message", () => {
    const { container } = render(
      <MessageDetailPanel
        message={null}
        onClose={vi.fn()}
        onOpenMedia={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders message detail, raw data, and structured-media delegation", () => {
    const onClose = vi.fn();
    const onOpenMedia = vi.fn();
    render(
      <MessageDetailPanel
        message={{
          id: "message-1",
          role: "assistant",
          text: "Details body\n\n```json\n{\"count\":2}\n```",
          timestamp: 1,
          raw: { source: "server" },
        }}
        onClose={onClose}
        onOpenMedia={onOpenMedia}
      />,
    );

    expect(screen.getByText("aiAssistant.messageDetail")).toBeInTheDocument();
    expect(screen.getByText("assistant")).toBeInTheDocument();
    expect(screen.getByText("Details body")).toBeInTheDocument();
    expect(screen.getByText(/"source": "server"/)).toBeInTheDocument();
    expect(screen.getByTestId("structured-renderer")).toHaveAttribute(
      "data-block-count",
      "1",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.closeDetail" }),
    );
    fireEvent.click(screen.getByTestId("structured-renderer"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenMedia).toHaveBeenCalledWith({
      kind: "image",
      src: "/detail.png",
      title: "Detail media",
    });
  });
});
