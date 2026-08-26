// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";
import { ChatTimeline } from "./ChatTimeline";

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

function TimelineHarness({
  activeTurnId = null,
  messages,
  onSelectTurn = vi.fn(),
}: {
  activeTurnId?: string | null;
  messages: ChatMessage[];
  onSelectTurn?: (turnId: string) => void;
}) {
  return (
    <div>
      <ChatTimeline
        activeTurnId={activeTurnId}
        messages={messages}
        onSelectTurn={onSelectTurn}
      />
    </div>
  );
}

const originalOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetWidth",
);
const originalOffsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetHeight",
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 36,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 600,
  });
});

afterAll(() => {
  if (originalOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
  }
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
  }
});

describe("SuperChat timeline", () => {
  beforeEach(() => {
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
    const onSelectTurn = vi.fn();
    render(
      <TimelineHarness
        messages={[
          message("user-1", "user", "First request"),
          message("user-2", "user", "Second request"),
        ]}
        onSelectTurn={onSelectTurn}
      />,
    );
    const first = screen.getByRole("button", {
      name: "Turn 1: First request",
    });

    fireEvent.click(first);
    expect(onSelectTurn).toHaveBeenCalledWith("user-1");

    fireEvent.mouseEnter(first);
    expect(screen.getByText("First request")).toBeInTheDocument();
    fireEvent.mouseLeave(first);
    expect(screen.queryByText("First request")).toBeNull();
  });

  it("virtualizes large turn lists", () => {
    const messages = Array.from({ length: 200 }, (_, index) =>
      message(`user-${index}`, "user", `Request ${index}`),
    );

    render(<TimelineHarness messages={messages} />);

    const renderedTurns = screen.getAllByRole("button");
    expect(renderedTurns.length).toBeGreaterThan(0);
    expect(renderedTurns.length).toBeLessThan(messages.length);
  });
});
