// Copyright (c) 2026 AI anime
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StructuredSlashCommandName } from "@/modules/ai_assistant/domain/contracts";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count == null ? key : `${key}:${options.count}`,
  }),
}));

import { ChatComposer } from "./ChatComposer";

type ComposerProps = Parameters<typeof ChatComposer>[0];

function props(overrides: Partial<ComposerProps> = {}): ComposerProps {
  return {
    activeModel: "auto",
    activeReasoningEffort: null,
    attachments: [],
    busy: false,
    canSend: true,
    connected: true,
    draft: "",
    draftInputRef: createRef<HTMLTextAreaElement>(),
    dragFileState: null,
    fileInputRef: createRef<HTMLInputElement>(),
    fileUploadEnabled: false,
    isFreezoneLayout: false,
    queuedMessages: [],
    models: [],
    modelsLoading: false,
    slashCommands: [],
    recording: false,
    transcribing: false,
    selectedHistoryMessageIndex: null,
    selectedQueuedMessageId: null,
    shellRef: createRef<HTMLDivElement>(),
    showWaitingIndicator: false,
    onAbort: vi.fn(),
    onAddFiles: vi.fn(),
    onAttachmentRemove: vi.fn(),
    onDragEnter: vi.fn(),
    onDragLeave: vi.fn(),
    onDragOver: vi.fn(),
    onDraftChange: vi.fn(),
    onDraftFocusChange: vi.fn(),
    onDropFiles: vi.fn(() => false),
    onRunSlashCommand: vi.fn(async (command) => ({
      command,
      text: "命令执行完成",
    })),
    onHistorySelect: vi.fn(() => false),
    onOpenFilePicker: vi.fn(),
    onQueueOffset: vi.fn(),
    onQueueRemove: vi.fn(),
    onQueueSelect: vi.fn(),
    onRefreshModels: vi.fn(),
    onResetHistorySelection: vi.fn(),
    onSubmit: vi.fn(),
    onSwitchModel: vi.fn(() => true),
    onSwitchReasoningEffort: vi.fn(() => true),
    onToggleSpeech: vi.fn(),
    ...overrides,
  };
}

describe("SuperChat Composer view", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders attachment presentation and forwards removal", () => {
    const onAttachmentRemove = vi.fn();
    render(<ChatComposer {...props({
      attachments: [{
        id: "attachment-1",
        fileName: "cover.png",
        mimeType: "image/png",
      }],
      onAttachmentRemove,
      showWaitingIndicator: true,
    })} />);

    expect(screen.getByText("cover.png")).toBeInTheDocument();
    expect(screen.getByText("aiAssistant.disclaimer")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.removeAttachment" }),
    );
    expect(onAttachmentRemove).toHaveBeenCalledWith("attachment-1");
  });

  it("routes queue and history arrows before handling Enter submission", () => {
    const queueProps = props({
      queuedMessages: [{ id: "queue-1", text: "排队", attachments: [] }],
    });
    const { rerender } = render(<ChatComposer {...queueProps} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    expect(queueProps.onQueueOffset).toHaveBeenCalledWith(-1);
    expect(queueProps.onHistorySelect).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter" });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(queueProps.onSubmit).toHaveBeenCalledTimes(1);

    const historyProps = props({ selectedHistoryMessageIndex: 0 });
    rerender(<ChatComposer {...historyProps} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowDown" });
    expect(historyProps.onHistorySelect).toHaveBeenNthCalledWith(1, "older");
    expect(historyProps.onHistorySelect).toHaveBeenNthCalledWith(2, "newer");
  });

  it("filters slash commands and opens help as a structured second-level route", () => {
    const onDraftChange = vi.fn();
    const commandProps = props({
      draft: "/he",
      onDraftChange,
      slashCommands: [
        { name: "help", description: "List commands" },
        { name: "model", description: "Switch model", inputHint: "model" },
      ],
    });
    const { rerender } = render(<ChatComposer {...commandProps} />);
    const textarea = screen.getByRole("textbox");

    expect(screen.getByRole("listbox", { name: "aiAssistant.slashCommands" }))
      .toBeInTheDocument();
    expect(screen.getByRole("option", { name: /\/help/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /\/model/ })).toBeNull();

    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onDraftChange).toHaveBeenCalledWith("");
    expect(screen.getByText("命令与 Skills")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "搜索命令或 Skill" }))
      .toBeInTheDocument();
    expect(commandProps.onRunSlashCommand).not.toHaveBeenCalled();
    expect(commandProps.onSubmit).not.toHaveBeenCalled();
    rerender(<ChatComposer {...props()} />);
  });

  it("opens a searchable model picker and applies a conversation-only route", () => {
    const onDraftChange = vi.fn();
    const onRefreshModels = vi.fn();
    const onSwitchModel = vi.fn(() => true);
    render(<ChatComposer {...props({
      draft: "/model",
      onDraftChange,
      onRefreshModels,
      onSwitchModel,
      slashCommands: [
        { name: "model", description: "选择当前对话模型", kind: "command" },
      ],
      models: [
        {
          id: "auto",
          label: "自动（遵循模型优先级）",
          providerLabel: "全局路由",
          source: "auto",
        },
        {
          id: "cloud:text-model",
          label: "文本模型",
          providerLabel: "云端",
          source: "cloud",
        },
      ],
    })} />);

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onRefreshModels).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText("搜索模型或提供方…")).toBeInTheDocument();
    const option = screen.getByRole("option", { name: /文本模型/ });
    fireEvent.click(option);
    expect(onSwitchModel).toHaveBeenCalledWith("cloud:text-model");
  });

  it("opens a complete searchable tool route without sending a chat command", () => {
    const onDraftChange = vi.fn();
    const onRunSlashCommand = vi.fn();
    const tools = Array.from({ length: 58 }, (_, index) => ({
      name: index === 57 ? "ai_anime_start_single_video" : `tool_${index + 1}`,
      label: index === 0 ? "向用户提问" : index === 57 ? "生成单个 Beat 视频" : `工具 ${index + 1}`,
      description: index === 0
        ? "遇到会影响结果的关键歧义时，暂停执行并向用户提供清晰选项。"
        : index === 57
          ? "使用该 Beat 已保存的首帧和视频提示生成单段视频；模型始终遵循用途优先级。"
          : `工具 ${index + 1} 的完整用途说明。`,
      category: index === 0 ? "确认与决策" : "视频与成片",
      source: index === 0 ? "Hermes" : "AI anime",
    }));
    render(<ChatComposer {...props({
      draft: "/tools",
      onDraftChange,
      onRunSlashCommand,
      slashCommands: [{
        name: "tools",
        description: "查看当前助手实际可调用的工具",
        kind: "command",
        tools,
      }],
    })} />);

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onRunSlashCommand).not.toHaveBeenCalled();
    expect(onDraftChange).toHaveBeenCalledWith("");
    expect(screen.getByText("58 个 · AI 自动调用")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "确认与决策" })).toBeInTheDocument();
    expect(screen.getByText(/遇到会影响结果的关键歧义/)).toBeInTheDocument();

    const search = screen.getByRole("combobox", { name: "搜索可用工具" });
    fireEvent.change(search, { target: { value: "start_single_video" } });
    expect(screen.getByRole("option", { name: /生成单个 Beat 视频/ }))
      .toHaveTextContent("模型始终遵循用途优先级");
    expect(screen.queryByRole("option", { name: /向用户提问/ })).toBeNull();

    fireEvent.keyDown(search, { key: "Escape" });
    expect(onDraftChange).toHaveBeenLastCalledWith("/");
    expect(screen.getByRole("option", { name: /\/tools/ })).toBeInTheDocument();
  });

  it("clears the parent search when entering a second-level catalog", () => {
    const tools = [
      {
        name: "question",
        label: "向用户提问",
        description: "请求用户确认关键参数。",
        category: "确认与决策",
        source: "AI anime",
      },
      {
        name: "terminal",
        label: "运行终端命令",
        description: "执行开发命令并读取输出。",
        category: "代码与执行",
        source: "Hermes",
      },
    ];
    render(<ChatComposer {...props({
      draft: "/help",
      slashCommands: [
        { name: "help", description: "查看命令", kind: "command" },
        { name: "tools", description: "查看工具", kind: "command", tools },
      ],
    })} />);

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    const search = screen.getByRole("combobox", { name: "搜索命令或 Skill" });
    fireEvent.change(search, { target: { value: "tools" } });
    fireEvent.click(screen.getByRole("option", { name: /\/tools/ }));

    expect(screen.getByRole("combobox", { name: "搜索可用工具" })).toHaveValue("");
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("opens the Codex-style composer model picker without replacing the draft", () => {
    const onDraftChange = vi.fn();
    const onRefreshModels = vi.fn();
    const onSwitchModel = vi.fn(() => true);
    render(<ChatComposer {...props({
      draft: "保留这段创作要求",
      onDraftChange,
      onRefreshModels,
      onSwitchModel,
      models: [
        {
          id: "auto",
          label: "自动（遵循模型优先级）",
          providerLabel: "全局路由",
          source: "auto",
        },
        {
          id: "cloud:text-model",
          label: "文本模型",
          providerLabel: "云端",
          source: "cloud",
        },
      ],
    })} />);

    const trigger = screen.getByRole("button", { name: /选择当前对话模型/ });
    expect(trigger).toHaveTextContent("自动 · 文本模型");
    expect(trigger).toHaveClass("h-7", "max-w-[168px]", "rounded-full");
    fireEvent.click(trigger);

    expect(onRefreshModels).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("menu", { name: /选择当前对话模型/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("aiAssistant.placeholder"))
      .toHaveValue("保留这段创作要求");
    expect(onDraftChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("menuitem", { name: /文本模型.*云端/ }));
    expect(onSwitchModel).toHaveBeenCalledWith("cloud:text-model");
    expect(onDraftChange).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("renders dynamic cloud and BYOK reasoning options without normalizing values", () => {
    const onSwitchReasoningEffort = vi.fn(() => true);
    render(<ChatComposer {...props({
      activeModel: "cloud:qwen38",
      activeReasoningEffort: "low",
      onSwitchReasoningEffort,
      models: [
        {
          id: "cloud:qwen38",
          label: "Qwen3.8-27B",
          providerLabel: "云端",
          source: "cloud",
          contextWindow: 32768,
          reasoningEfforts: ["none", "low", "medium", "high"],
          defaultReasoningEffort: "low",
        },
        {
          id: "byok:vllm:Qwen3.8-27B",
          label: "Qwen3.8-27B · BYOK",
          providerLabel: "本地 vLLM",
          source: "byok",
          contextWindow: 131072,
          reasoningEfforts: ["medium", "xhigh"],
          defaultReasoningEffort: "medium",
        },
      ],
    })} />);

    const trigger = screen.getByRole("button", { name: /选择当前对话模型/ });
    expect(trigger).toHaveTextContent("Qwen3.8-27B · low");
    fireEvent.click(trigger);

    expect(screen.getByText(
      "上下文 32,768 tokens · 思考 关闭思考 / low / medium / high",
    )).toBeInTheDocument();
    expect(screen.getByText(
      "上下文 131,072 tokens · 思考 medium / xhigh",
    )).toBeInTheDocument();
    expect(screen.getByText("默认 low")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "关闭思考" }));
    expect(onSwitchReasoningEffort).toHaveBeenCalledWith("none");
  });

  it("closes a composer-opened model picker without returning to slash commands", () => {
    const onDraftChange = vi.fn();
    render(<ChatComposer {...props({
      draft: "镜头继续向前推进",
      onDraftChange,
      models: [{ id: "auto", label: "自动", source: "auto" }],
    })} />);

    const trigger = screen.getByRole("button", { name: /选择当前对话模型/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: /选择当前对话模型/ })).toBeInTheDocument();
    fireEvent.click(trigger);

    expect(onDraftChange).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByPlaceholderText("搜索模型或提供方…")).toBeNull();
    expect(screen.queryByRole("listbox", { name: "aiAssistant.slashCommands" }))
      .toBeNull();
  });

  it("opens an automatically loaded Skill detail before inserting it", () => {
    const onDraftChange = vi.fn();
    render(<ChatComposer {...props({
      draft: "/ai",
      onDraftChange,
      slashCommands: [
        {
          name: "ai-anime",
          description: "AI 漫剧完整工作流",
          inputHint: "instruction",
          kind: "skill",
          source: "managed",
        },
      ],
    })} />);

    expect(screen.getByRole("group", { name: "aiAssistant.slashSkillGroup" }))
      .toBeInTheDocument();
    const option = screen.getByRole("option", { name: /\/ai-anime/ });
    expect(option).toBeInTheDocument();
    fireEvent.click(option);
    expect(screen.getByText("AI 漫剧完整工作流")).toBeInTheDocument();
    expect(screen.getByText("发送后自动加载 Skill 指引，再由助手按指引执行。"))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "在输入框中使用" }));
    expect(onDraftChange).toHaveBeenCalledWith("/ai-anime ");
  });

  it("places context maintenance beside the model picker and confirms mutations", async () => {
    const onRunSlashCommand = vi.fn(async (command: StructuredSlashCommandName) => ({
      command,
      ...(command === "context" ? { usage: { used: 18149, size: 131072 } } : {}),
      text: command === "context"
        ? [
            "模型上下文：8 条消息",
            "用户 3，助手 4，工具 1，系统 0",
            "模型路由：由当前对话选择决定",
            "提供方：统一模型网关",
            "压缩状态：距阈值约 12,000 tokens。",
            "提示：可立即压缩。",
          ].join("\n")
        : command === "version"
          ? "AI anime 助手运行内核：Hermes v0.19.0"
          : command === "compact"
            ? "模型上下文压缩完成：消息 8 → 4。"
            : "已清空当前对话的模型上下文。",
    }));
    const commandProps = props({ onRunSlashCommand });
    render(<ChatComposer {...commandProps} />);

    fireEvent.click(screen.getByRole("button", {
      name: "打开当前对话上下文与运行状态",
    }));

    expect(await screen.findByText("8 条消息")).toBeInTheDocument();
    expect(screen.getByText("约 18.1k / 131k tokens")).toBeInTheDocument();
    expect(screen.getByText("距压缩 12k")).toBeInTheDocument();
    expect(screen.getByText("用户 3 · 助手 4 · 工具 1 · 系统 0")).toBeInTheDocument();
    expect(screen.getByText("当前对话路由 · 统一网关")).toBeInTheDocument();
    expect(screen.queryByText(/提示：/)).toBeNull();
    expect(screen.getByText(/Hermes v0.19.0/)).toBeInTheDocument();
    expect(onRunSlashCommand).toHaveBeenCalledWith("context");
    expect(onRunSlashCommand).toHaveBeenCalledWith("version");
    expect(commandProps.onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /压缩上下文/ }));
    expect(screen.getByText("压缩上下文？")).toBeInTheDocument();
    expect(onRunSlashCommand).not.toHaveBeenCalledWith("compact");
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(await screen.findByText(/模型上下文压缩完成/)).toBeInTheDocument();
    expect(onRunSlashCommand).toHaveBeenCalledWith("compact");

    fireEvent.click(screen.getByRole("button", { name: /清空上下文/ }));
    expect(screen.getByText("清空上下文？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onRunSlashCommand).not.toHaveBeenCalledWith("reset");

    fireEvent.click(screen.getByRole("button", { name: /清空上下文/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(await screen.findByText("已清空 · 聊天记录保留")).toBeInTheDocument();
    expect(onRunSlashCommand).toHaveBeenCalledWith("reset");
  });

  it("collapses an empty context without repeating zero counters", async () => {
    const onRunSlashCommand = vi.fn(async (command: StructuredSlashCommandName) => ({
      command,
      ...(command === "context" ? { usage: { used: 18149, size: 131072 } } : {}),
      text: command === "context"
        ? [
            "当前模型上下文为空。",
            "用户 0，助手 0，工具 0，系统 0",
            "模型路由：由当前对话选择决定",
            "提供方：统一模型网关",
            "压缩状态：距阈值约 80,155 tokens。",
          ].join("\n")
        : "AI anime 助手运行内核：Hermes v0.19.0",
    }));
    render(<ChatComposer {...props({ onRunSlashCommand })} />);

    fireEvent.click(screen.getByRole("button", {
      name: "打开当前对话上下文与运行状态",
    }));

    expect(await screen.findByText("对话历史已清空")).toBeInTheDocument();
    expect(screen.getByText("基础 13.8%")).toBeInTheDocument();
    expect(screen.getByText("基础约 18.1k / 131k tokens")).toBeInTheDocument();
    expect(screen.getByText("距压缩 80.2k")).toBeInTheDocument();
    expect(screen.queryByText(/用户 0/)).toBeNull();
  });

  it("forwards file and drag actions and restores draft focus", () => {
    const focus = vi
      .spyOn(HTMLTextAreaElement.prototype, "focus")
      .mockImplementation(() => undefined);
    const onAddFiles = vi.fn();
    const onDropFiles = vi.fn(() => true);
    const dragEnter = vi.fn();
    const dragLeave = vi.fn();
    const dragOver = vi.fn();
    const composerProps = props({
      fileUploadEnabled: true,
      onAddFiles,
      onDragEnter: dragEnter,
      onDragLeave: dragLeave,
      onDragOver: dragOver,
      onDropFiles,
    });
    const { container } = render(<ChatComposer {...composerProps} />);
    const file = new File(["story"], "story.txt", { type: "text/plain" });
    const files = [file] as unknown as FileList;
    const input = container.querySelector('input[type="file"]');
    const shell = container.querySelector("[data-composer-shell]");
    if (!input || !shell) throw new Error("Composer file controls are missing");

    fireEvent.change(input, { target: { files } });
    fireEvent.dragEnter(shell);
    fireEvent.dragOver(shell);
    fireEvent.dragLeave(shell);
    fireEvent.drop(shell);

    expect(onAddFiles).toHaveBeenCalledWith(files);
    expect(dragEnter).toHaveBeenCalledTimes(1);
    expect(dragOver).toHaveBeenCalledTimes(1);
    expect(dragLeave).toHaveBeenCalledTimes(1);
    expect(onDropFiles).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it("adds images pasted from the clipboard without replacing the draft", () => {
    const onAddFiles = vi.fn();
    render(<ChatComposer {...props({
      fileUploadEnabled: true,
      onAddFiles,
    })} />);
    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    const text = new File(["text"], "notes.txt", { type: "text/plain" });

    const accepted = fireEvent.paste(screen.getByRole("textbox"), {
      clipboardData: {
        items: [
          { kind: "file", type: image.type, getAsFile: () => image },
          { kind: "file", type: text.type, getAsFile: () => text },
        ],
      },
    });

    expect(accepted).toBe(false);
    expect(onAddFiles).toHaveBeenCalledWith([image]);
  });

  it("keeps ordinary text paste unchanged", () => {
    const onAddFiles = vi.fn();
    render(<ChatComposer {...props({
      fileUploadEnabled: true,
      onAddFiles,
    })} />);

    const accepted = fireEvent.paste(screen.getByRole("textbox"), {
      clipboardData: { items: [] },
    });

    expect(accepted).toBe(true);
    expect(onAddFiles).not.toHaveBeenCalled();
  });

  it("forwards speech, send, abort, and focus-state actions", () => {
    const onDraftFocusChange = vi.fn();
    const idleProps = props({ onDraftFocusChange });
    const { rerender } = render(<ChatComposer {...idleProps} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.focus(textarea);
    fireEvent.blur(textarea);
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.voiceInput" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "aiAssistant.send" }));
    expect(onDraftFocusChange.mock.calls).toEqual([[true], [false]]);
    expect(idleProps.onToggleSpeech).toHaveBeenCalledTimes(1);
    expect(idleProps.onSubmit).toHaveBeenCalledTimes(1);

    const busyProps = props({ busy: true, recording: true });
    rerender(<ChatComposer {...busyProps} />);
    expect(screen.getByRole("button", {
      name: "打开当前对话上下文与运行状态",
    })).toBeDisabled();
    expect(screen.getByRole("button", {
      name: /选择当前对话模型/,
    })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "aiAssistant.stopVoice" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "aiAssistant.stop" }));
    expect(busyProps.onToggleSpeech).toHaveBeenCalledTimes(1);
    expect(busyProps.onAbort).toHaveBeenCalledTimes(1);
  });
});
