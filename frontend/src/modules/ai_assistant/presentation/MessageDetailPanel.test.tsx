// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/modules/ai_assistant/presentation/ChatMessageView", () => ({
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

import { MessageDetailPanel } from "./MessageDetailPanel";

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
