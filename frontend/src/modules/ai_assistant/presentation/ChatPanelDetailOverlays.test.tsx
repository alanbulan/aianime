// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ai_assistant/presentation/MessageDetailPanel", () => ({
  MessageDetailPanel: ({
    message,
    onClose,
    onOpenMedia,
  }: {
    message: { id: string } | null;
    onClose: () => void;
    onOpenMedia: (detail: unknown) => void;
  }) => (
    <div data-testid="message-detail" data-message-id={message?.id ?? ""}>
      <button type="button" onClick={onClose}>close detail</button>
      <button
        type="button"
        onClick={() => onOpenMedia({ kind: "image", src: "/message.png" })}
      >
        open message media
      </button>
    </div>
  ),
}));

vi.mock("@/modules/ai_assistant/presentation/SpecMediaModals", () => ({
  SpecMediaDetailModal: ({
    detail,
    onClose,
    onOpenMedia,
  }: {
    detail: { src: string } | null;
    onClose: () => void;
    onOpenMedia: (detail: unknown) => void;
  }) => (
    <div data-testid="media-detail" data-src={detail?.src ?? ""}>
      <button type="button" onClick={onClose}>close media</button>
      <button
        type="button"
        onClick={() => onOpenMedia({ kind: "video", src: "/next.mp4" })}
      >
        open candidate
      </button>
    </div>
  ),
}));

vi.mock("@/components/ingest/FormatCheckDetailsDialog", () => ({
  FormatCheckDetailsDialog: ({
    filename,
    formatCheck,
    open,
    onOpenChange,
  }: {
    filename?: string;
    formatCheck: { summary: string } | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div
      data-testid="format-check"
      data-filename={filename ?? ""}
      data-open={open}
      data-summary={formatCheck?.summary ?? ""}
    >
      <button type="button" onClick={() => onOpenChange(true)}>keep open</button>
      <button type="button" onClick={() => onOpenChange(false)}>close format</button>
    </div>
  ),
}));

import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import { ChatPanelDetailOverlays } from "./ChatPanelDetailOverlays";

const message: ChatMessage = {
  id: "message-1",
  role: "assistant",
  text: "Details",
  timestamp: 1,
};

function baseProps() {
  return {
    detailMessage: null,
    formatCheck: null,
    formatCheckFilename: undefined,
    formatCheckOpen: false,
    mediaDetail: null,
    onClearFormatCheckDetails: vi.fn(),
    onCloseDetail: vi.fn(),
    onCloseMedia: vi.fn(),
    onOpenMedia: vi.fn(),
  };
}

describe("SuperChat panel detail overlays", () => {
  it("projects empty and populated detail models", () => {
    const props = baseProps();
    const { rerender } = render(<ChatPanelDetailOverlays {...props} />);

    expect(screen.getByTestId("message-detail")).toHaveAttribute(
      "data-message-id",
      "",
    );
    expect(screen.getByTestId("media-detail")).toHaveAttribute("data-src", "");
    expect(screen.getByTestId("format-check")).toHaveAttribute(
      "data-open",
      "false",
    );

    rerender(
      <ChatPanelDetailOverlays
        {...props}
        detailMessage={message}
        formatCheck={{ level: "warning", summary: "Check format" }}
        formatCheckFilename="story.txt"
        formatCheckOpen
        mediaDetail={{ kind: "image", src: "/detail.png" }}
      />,
    );
    expect(screen.getByTestId("message-detail")).toHaveAttribute(
      "data-message-id",
      "message-1",
    );
    expect(screen.getByTestId("media-detail")).toHaveAttribute(
      "data-src",
      "/detail.png",
    );
    expect(screen.getByTestId("format-check")).toHaveAttribute(
      "data-filename",
      "story.txt",
    );
    expect(screen.getByTestId("format-check")).toHaveAttribute(
      "data-summary",
      "Check format",
    );
  });

  it("forwards detail navigation and clears format details only on close", () => {
    const props = baseProps();
    render(<ChatPanelDetailOverlays {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "close detail" }));
    fireEvent.click(screen.getByRole("button", { name: "open message media" }));
    fireEvent.click(screen.getByRole("button", { name: "close media" }));
    fireEvent.click(screen.getByRole("button", { name: "open candidate" }));
    fireEvent.click(screen.getByRole("button", { name: "keep open" }));
    fireEvent.click(screen.getByRole("button", { name: "close format" }));

    expect(props.onCloseDetail).toHaveBeenCalledTimes(1);
    expect(props.onCloseMedia).toHaveBeenCalledTimes(1);
    expect(props.onOpenMedia).toHaveBeenNthCalledWith(1, {
      kind: "image",
      src: "/message.png",
    });
    expect(props.onOpenMedia).toHaveBeenNthCalledWith(2, {
      kind: "video",
      src: "/next.mp4",
    });
    expect(props.onClearFormatCheckDetails).toHaveBeenCalledTimes(1);
  });
});
