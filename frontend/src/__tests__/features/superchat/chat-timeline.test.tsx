// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatTimeline } from "@/features/superchat/chat-timeline";
import type { ChatMessage } from "@/features/superchat/types";

function message(
  id: string,
  role: ChatMessage["role"],
  text: string,
  attachments?: ChatMessage["attachments"],
): ChatMessage {
  return {
    id,
    role,
    text,
    attachments,
    timestamp: Date.UTC(2026, 0, 1, 12, 0),
  };
}

function TimelineHarness({ messages }: { messages: ChatMessage[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={scrollRef}>
      {messages
        .filter((item) => item.role === "user")
        .map((item) => (
          <article key={item.id} data-turn-id={item.id} />
        ))}
      <ChatTimeline messages={messages} scrollRef={scrollRef} />
    </div>
  );
}

describe("SuperChat timeline", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockReset();
    Object.defineProperty(CSS, "escape", {
      configurable: true,
      value: (value: string) => value,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollBy", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("stays hidden until at least two user turns exist", () => {
    render(
      <TimelineHarness
        messages={[
          message("user-1", "user", "First request"),
          message("assistant-1", "assistant", "Reply"),
        ]}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("projects only user turns and derives attachment fallbacks", () => {
    render(
      <TimelineHarness
        messages={[
          message("user-1", "user", "First request"),
          message("assistant-1", "assistant", "Reply"),
          message("user-2", "user", "", [
            { fileName: "cover.png", mimeType: "image/png" },
          ]),
          message("user-3", "user", "", [
            { fileName: "story.txt", mimeType: "text/plain" },
          ]),
        ]}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: "Turn 1: First request" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Turn 2: Image" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Turn 3: File" }),
    ).toBeInTheDocument();
  });

  it("scrolls to a selected turn and renders its hover preview in a portal", () => {
    render(
      <TimelineHarness
        messages={[
          message("user-1", "user", "First request"),
          message("user-2", "user", "Second request"),
        ]}
      />,
    );
    const first = screen.getByRole("button", {
      name: "Turn 1: First request",
    });

    fireEvent.click(first);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });

    fireEvent.mouseEnter(first);
    expect(screen.getByText("First request")).toBeInTheDocument();
    fireEvent.mouseLeave(first);
    expect(screen.queryByText("First request")).toBeNull();
  });
});
