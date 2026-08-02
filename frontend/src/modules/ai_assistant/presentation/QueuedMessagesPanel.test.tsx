// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count == null ? key : `${key}:${options.count}`,
  }),
}));

import { QueuedMessagesPanel } from "./QueuedMessagesPanel";

describe("SuperChat queued messages panel", () => {
  it("renders nothing for an empty queue", () => {
    const { container } = render(
      <QueuedMessagesPanel
        messages={[]}
        selectedMessageId={null}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows counts and forwards selection and removal actions", () => {
    const onRemove = vi.fn();
    const onSelect = vi.fn();
    render(
      <QueuedMessagesPanel
        messages={[
          { id: "queue-1", text: "第一条", attachments: [] },
          {
            id: "queue-2",
            text: "第二条",
            attachments: [{ fileName: "story.txt" }],
          },
        ]}
        selectedMessageId="queue-2"
        onRemove={onRemove}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("aiAssistant.queuedCount:2")).toBeInTheDocument();
    expect(
      screen.getByText("aiAssistant.queuedAttachments:1"),
    ).toBeInTheDocument();
    const selectButtons = screen.getAllByRole("button", {
      name: "aiAssistant.selectQueuedMessage",
    });
    expect(selectButtons[0]).toHaveAttribute("aria-pressed", "false");
    expect(selectButtons[1]).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(selectButtons[0]);
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "aiAssistant.removeQueuedMessage",
      })[1],
    );

    expect(onSelect).toHaveBeenCalledWith("queue-1");
    expect(onRemove).toHaveBeenCalledWith("queue-2");
  });
});
