// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/features/superchat/ai-avatar", () => ({
  useAiAvatarUrl: () => "/assistant-avatar.webm",
}));

vi.mock("@/features/superchat/spec-media-gallery", () => ({
  UiSpecRenderer: ({
    onOpenMedia,
    spec,
  }: {
    onOpenMedia?: (detail: {
      kind: "image";
      src: string;
      title: string;
    }) => void;
    spec: { type?: string };
  }) => (
    <button
      type="button"
      aria-label="open-spec-media"
      onClick={() => onOpenMedia?.({
        kind: "image",
        src: "/spec.png",
        title: "Spec media",
      })}
    >
      {spec.type}
    </button>
  ),
}));

import {
  MessageBubble,
  StructuredRenderer,
} from "@/features/superchat/chat-message-view";
import type { ChatMessage } from "@/features/superchat/types";

function message(
  role: ChatMessage["role"],
  text: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: "message-1",
    role,
    text,
    timestamp: 1,
    ...overrides,
  };
}

function bubbleProps(chatMessage: ChatMessage) {
  return {
    message: chatMessage,
    onOpenDetail: vi.fn(),
    onOpenMedia: vi.fn(),
    pinned: false,
    onDelete: vi.fn(),
    onTogglePin: vi.fn(),
  };
}

describe("SuperChat chat message view", () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();

  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("renders user text, hides visual-media chips, and forwards message actions", async () => {
    const chatMessage = message("user", "First line\n\nSecond line", {
      attachments: [
        { id: "image", fileName: "hero.png", mimeType: "image/png" },
        { id: "video", fileName: "scene.mp4", mimeType: "video/mp4" },
        { id: "file", fileName: "brief.pdf", mimeType: "application/pdf" },
      ],
    });
    const props = bubbleProps(chatMessage);
    render(<MessageBubble {...props} variant="freezone" />);

    expect(screen.getByText(/First line/)).toBeInTheDocument();
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(screen.queryByText("hero.png")).toBeNull();
    expect(screen.queryByText("scene.mp4")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(chatMessage.text);
    });
    expect(props.onOpenDetail).toHaveBeenCalledWith(chatMessage);
    expect(props.onTogglePin).toHaveBeenCalledWith(chatMessage.id);
    expect(props.onDelete).toHaveBeenCalledWith(chatMessage.id);
  });

  it("renders assistant Markdown, display name, and the shared avatar", () => {
    const { container } = render(
      <MessageBubble
        {...bubbleProps(
          message("assistant", "Hello **world**", { displayName: "Director" }),
        )}
      />,
    );

    expect(screen.getByText("Director")).toBeInTheDocument();
    expect(screen.getByText("world").tagName).toBe("STRONG");
    expect(container.querySelector("video")).toHaveAttribute(
      "src",
      "/assistant-avatar.webm",
    );
  });

  it("labels legacy trace envelopes as historical tools", () => {
    render(
      <MessageBubble
        {...bubbleProps(
          message("assistant", "tool output", { raw: { role: "trace" } }),
        )}
      />,
    );

    expect(screen.getByText("aiAssistant.historyTool")).toBeInTheDocument();
    expect(screen.getByText("tool output")).toBeInTheDocument();
  });

  it("highlights assistant error sentences and completion prefixes", () => {
    const props = bubbleProps(
      message("assistant", "生成封面失败，请稍后重试。继续其他步骤。"),
    );
    const { container, rerender } = render(<MessageBubble {...props} />);

    expect(container.querySelector(".text-destructive")).toHaveTextContent(
      "生成封面失败，请稍后重试。",
    );

    rerender(
      <MessageBubble
        {...bubbleProps(
          message("assistant", "✅ 视频已完成。可以继续下一步。", {
            id: "message-2",
          }),
        )}
      />,
    );
    expect(container.querySelector(".text-success")).toHaveTextContent(
      "✅ 视频已完成。",
    );
  });

  it("defers incomplete structured assistant output", () => {
    render(
      <MessageBubble
        {...bubbleProps(message("assistant", "```json\n{\"type\":"))}
        deferStructuredRender
      />,
    );

    expect(
      screen.getByText("aiAssistant.waitingStructuredRender"),
    ).toBeInTheDocument();
  });

  it("renders JSON blocks and delegates UiSpec media interactions", async () => {
    const onOpenMedia = vi.fn();
    render(
      <StructuredRenderer
        blocks={[
          { id: "json", label: "json", value: { count: 2 } },
          {
            id: "spec",
            label: "ui-spec",
            value: {
              type: "media_bundle",
              root: "root",
              elements: { root: { type: "Grid" } },
            },
          },
        ]}
        onOpenMedia={onOpenMedia}
      />,
    );

    expect(screen.getByText("count")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "open-spec-media" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("{\n  \"count\": 2\n}");
    });
    expect(onOpenMedia).toHaveBeenCalledWith({
      kind: "image",
      src: "/spec.png",
      title: "Spec media",
    });
  });
});
