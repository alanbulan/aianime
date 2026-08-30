// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/modules/ai_assistant/presentation/QiuQiuAvatar", () => ({
  QiuQiuAvatar: ({ emotionId }: { emotionId: string }) => (
    <span data-testid="qiuqiu-avatar" data-emotion={emotionId} />
  ),
}));

vi.mock("@/modules/ai_assistant/presentation/SpecMediaGallery", () => ({
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
  ToolExecutionList,
} from "./ChatMessageView";
import type { ChatMessage } from "@/modules/ai_assistant/domain/contracts";

const LONG_OPENAI_COMPATIBLE_REPLY = [
  "我是 AI anime 助手，当前运行的模型是 **Qwen（QWEN3_8_27B）**，由自定义接入方（custom provider）提供。",
  "关于上下文大小：我这边没有直接的精确数字。按 Qwen 这个级别的模型通常配置来看，上下文窗口一般在 **128K token** 左右，具体以你部署侧实际拉起的参数为准。",
  "如果你需要精确的上下文上限，可以在你的部署/接入配置里查一下模型启动参数中的 `max_model_len` 或 `context_length` 字段，那个值才是权威来源。",
  "服务端这边我继续处理 PUBLIC_HTTP 的 Bearer Key、三个远程入口鉴权、HTTPS 域名与生产配置，不再扫描客户端仓库。",
].join("\n\n");

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

    fireEvent.click(screen.getByRole("button", { name: "aiAssistant.copy" }));
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.details" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.pinContext" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.excludeContext" }),
    );
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(
      screen.getByText("aiAssistant.excludeContextConfirmDescription"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "aiAssistant.excludeContextConfirmAction",
      }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(chatMessage.text);
    });
    expect(props.onOpenDetail).toHaveBeenCalledWith(chatMessage);
    expect(props.onTogglePin).toHaveBeenCalledWith(chatMessage.id);
    expect(props.onDelete).toHaveBeenCalledWith(chatMessage.id);
  });

  it("restores an excluded message without showing the exclusion dialog", () => {
    const props = bubbleProps(message("assistant", "Excluded content"));
    render(<MessageBubble {...props} excluded />);

    expect(screen.getByText("aiAssistant.contextExcluded")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.restoreContext" }),
    );

    expect(props.onDelete).toHaveBeenCalledWith("message-1");
    expect(
      screen.queryByText("aiAssistant.excludeContextConfirmDescription"),
    ).toBeNull();
  });

  it("renders assistant Markdown, display name, and the QiuQiu avatar", () => {
    render(
      <MessageBubble
        {...bubbleProps(
          message("assistant", "Hello **world**", { displayName: "Director" }),
        )}
      />,
    );

    expect(screen.getByText("Director")).toBeInTheDocument();
    expect(screen.getByText("world").tagName).toBe("STRONG");
    expect(screen.getByTestId("qiuqiu-avatar")).toHaveAttribute(
      "data-emotion",
      "02",
    );
  });

  it("renders a long multi-paragraph Markdown reply without clipping its tail", () => {
    const { container } = render(
      <MessageBubble
        {...bubbleProps(message("assistant", LONG_OPENAI_COMPATIBLE_REPLY))}
      />,
    );

    const article = container.querySelector("article");
    const markdown = screen.getByTestId("message-markdown");
    expect(article).not.toBeNull();
    expect(article?.className).not.toMatch(
      /(?:truncate|whitespace-nowrap|line-clamp|overflow-hidden)/u,
    );
    expect(markdown?.className).not.toMatch(
      /(?:truncate|whitespace-nowrap|line-clamp|overflow-hidden)/u,
    );
    expect(markdown).toHaveClass(
      "whitespace-normal",
      "break-words",
      "[overflow-wrap:anywhere]",
    );

    const paragraphs = Array.from(markdown.querySelectorAll("p"));
    expect(paragraphs).toHaveLength(4);
    for (const paragraph of paragraphs) {
      expect(paragraph).toBeVisible();
    }
    expect(paragraphs.map((paragraph) => paragraph.textContent).join("\n\n")).toBe(
      LONG_OPENAI_COMPATIBLE_REPLY.replace(/\*\*|`/gu, ""),
    );
    expect(markdown).toHaveTextContent("custom provider");
    expect(markdown).toHaveTextContent("128K token");
    expect(screen.getByText("max_model_len")).toBeVisible();
    expect(screen.getByText("context_length")).toBeVisible();
    expect(markdown).toHaveTextContent(
      "服务端这边我继续处理 PUBLIC_HTTP 的 Bearer Key、三个远程入口鉴权、HTTPS 域名与生产配置，不再扫描客户端仓库。",
    );
  });

  it("keeps wide GFM tables inside a horizontal scroll container", () => {
    render(
      <MessageBubble
        {...bubbleProps(message(
          "assistant",
          "| 字段 | 说明 |\n| --- | --- |\n| max_model_len | extraordinarily-long-unbroken-provider-value-1234567890 |",
        ))}
      />,
    );

    const scrollContainer = screen.getByTestId(
      "message-markdown-table-scroll",
    );
    expect(scrollContainer).toHaveClass("max-w-full", "overflow-x-auto");
    expect(scrollContainer).not.toHaveClass("overflow-hidden");
    expect(screen.getByRole("table")).toBeVisible();
    expect(
      screen.getByText("extraordinarily-long-unbroken-provider-value-1234567890"),
    ).toBeVisible();
  });

  it("maps live tool activity to the matching QiuQiu agent state", () => {
    render(
      <MessageBubble
        {...bubbleProps(
          message("tool", "", {
            toolName: "browser_navigate",
            toolState: "running",
          }),
        )}
      />,
    );

    expect(screen.getByTestId("qiuqiu-avatar")).toHaveAttribute(
      "data-emotion",
      "36",
    );
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
    fireEvent.click(screen.getByRole("button", { name: "aiAssistant.copyJson" }));
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

  it("renders multiple tool calls as a numbered execution checklist", () => {
    render(
      <ToolExecutionList
        messages={[
          message("tool", "", {
            id: "tool-1",
            toolName: "ai_anime_get",
            toolState: "success",
          }),
          message("tool", "", {
            id: "tool-2",
            toolName: "ai_anime_post",
            toolState: "running",
          }),
        ]}
      />,
    );

    expect(screen.getByRole("region", { name: "aiAssistant.toolPlan" })).toBeInTheDocument();
    expect(screen.getByText("读取项目数据")).toBeInTheDocument();
    expect(screen.getByText("提交项目操作")).toBeInTheDocument();
    expect(screen.getByTestId("qiuqiu-avatar")).toHaveAttribute(
      "data-emotion",
      "31",
    );
  });
});
