// Copyright (c) 2026 AI anime
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Command } from "@/components/ui/command";
import type {
  ChatSlashCommand,
  ModelEntry,
  StructuredSlashCommandName,
} from "@/modules/ai_assistant/domain/contracts";

import { ComposerContextMenu } from "./ComposerContextMenu";
import { ComposerModelMenu } from "./ComposerModelMenu";
import { SlashCommandMenu } from "./SlashCommandMenu";

const models: ModelEntry[] = [
  {
    id: "auto",
    label: "自动",
    source: "auto",
    contextWindow: 128_000,
  },
  {
    id: "claude-sonnet",
    label: "Claude Sonnet",
    source: "cloud",
    contextWindow: 200_000,
    reasoningEfforts: ["low", "high"],
    defaultReasoningEffort: "low",
  },
];

describe("ComposerModelMenu", () => {
  it("forwards model and only declared reasoning-effort selections", async () => {
    const user = userEvent.setup();
    const onSelectModel = vi.fn();
    const onSelectReasoningEffort = vi.fn();

    render(
      <ComposerModelMenu
        activeModel="claude-sonnet"
        activeReasoningEffort="low"
        busy={false}
        connected
        models={models}
        modelsLoading={false}
        open
        onOpenChange={vi.fn()}
        onSelectModel={onSelectModel}
        onSelectReasoningEffort={onSelectReasoningEffort}
      />,
    );

    await user.click(screen.getByRole("menuitem", { name: /自动/ }));
    expect(screen.queryByRole("menuitem", { name: "关闭" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "high" }));

    expect(onSelectModel).toHaveBeenCalledWith("auto");
    expect(onSelectReasoningEffort).toHaveBeenCalledWith("high");
  });

  it("offers disabled reasoning only when the model declares none", async () => {
    const user = userEvent.setup();
    const onSelectReasoningEffort = vi.fn();
    const modelsWithDisabledReasoning = models.map((model) =>
      model.id === "claude-sonnet"
        ? { ...model, reasoningEfforts: ["none", "low", "high"] }
        : model
    );

    render(
      <ComposerModelMenu
        activeModel="claude-sonnet"
        activeReasoningEffort="low"
        busy={false}
        connected
        models={modelsWithDisabledReasoning}
        modelsLoading={false}
        open
        onOpenChange={vi.fn()}
        onSelectModel={vi.fn()}
        onSelectReasoningEffort={onSelectReasoningEffort}
      />,
    );

    await user.click(screen.getByRole("menuitem", { name: "关闭" }));

    expect(onSelectReasoningEffort).toHaveBeenCalledWith("none");
  });
});

describe("ComposerContextMenu", () => {
  it("loads status and confirms context compaction", async () => {
    const user = userEvent.setup();
    const onRunCommand = vi.fn(async (command: StructuredSlashCommandName) => ({
      command,
      text: command === "version"
        ? "Hermes v1.2.3"
        : command === "compact"
          ? "上下文已压缩。"
          : "模型上下文：2 条消息\n用户 1，助手 1，工具 0，系统 0",
      ...(command === "context" ? { usage: { used: 100, size: 1_000 } } : {}),
    }));

    render(
      <ComposerContextMenu
        busy={false}
        connected
        open
        onOpenChange={vi.fn()}
        onRunCommand={onRunCommand}
      />,
    );

    await waitFor(() => {
      expect(onRunCommand).toHaveBeenCalledWith("context");
      expect(onRunCommand).toHaveBeenCalledWith("version");
    });
    await user.click(screen.getByRole("button", {
      name: "压缩上下文，聊天记录保持完整",
    }));
    expect(screen.getByText("压缩上下文？")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(onRunCommand).toHaveBeenCalledWith("compact");
    });
  });
});

describe("SlashCommandMenu", () => {
  it("forwards a selected slash command", async () => {
    const user = userEvent.setup();
    const onSelectCommand = vi.fn();
    const command: ChatSlashCommand = {
      name: "help",
      description: "查看命令说明",
      kind: "command",
    };

    render(
      <Command>
        <SlashCommandMenu
          activeModel="auto"
          commands={[command]}
          disabled={false}
          isFreezoneLayout={false}
          listboxId="slash-menu"
          mode="commands"
          models={models}
          modelsLoading={false}
          query=""
          selectedCommand={null}
          tools={[]}
          onBack={vi.fn()}
          onQueryChange={vi.fn()}
          onSelectCommand={onSelectCommand}
          onSelectModel={vi.fn()}
          onUseSkill={vi.fn()}
        />
      </Command>,
    );

    await user.click(screen.getByLabelText("/help：查看命令说明"));

    expect(onSelectCommand).toHaveBeenCalledWith(command);
  });
});
