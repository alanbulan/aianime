// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHAT_SLASH_COMMANDS,
  filterSlashCommands,
  normalizeSlashCommands,
  slashCommandAction,
  slashCommandQuery,
} from "@/modules/ai_assistant/domain/slashCommand";

describe("AI Assistant slash commands", () => {
  it("only opens command search for a leading slash token", () => {
    expect(slashCommandQuery("/")).toBe("");
    expect(slashCommandQuery("/MoD")).toBe("mod");
    expect(slashCommandQuery(" /help")).toBeNull();
    expect(slashCommandQuery("/model ")).toBeNull();
    expect(slashCommandQuery("请执行 /help")).toBeNull();
  });

  it("normalizes ACP command updates and rejects malformed entries", () => {
    expect(normalizeSlashCommands([
      {
        name: "/model",
        description: "Switch model",
        input: { hint: "provider/model" },
      },
      { name: "bad command", description: "ignored" },
    ])).toEqual([
      {
        name: "model",
        description: "Switch model",
        inputHint: "provider/model",
        kind: "command",
      },
    ]);
    expect(normalizeSlashCommands([])).toBe(DEFAULT_CHAT_SLASH_COMMANDS);
  });

  it("normalizes the nested tool catalog and removes invalid duplicates", () => {
    expect(normalizeSlashCommands([{
      name: "tools",
      description: "查看工具",
      tools: [
        {
          name: "question",
          label: "向用户提问",
          description: "在不确定时让用户确认。",
          category: "确认与决策",
          source: "AI anime",
        },
        {
          name: "question",
          label: "重复项",
          description: "不应保留。",
          category: "其他",
          source: "AI anime",
        },
        { name: "broken", label: "缺少字段" },
      ],
    }])).toEqual([{
      name: "tools",
      description: "查看工具",
      kind: "command",
      tools: [{
        name: "question",
        label: "向用户提问",
        description: "在不确定时让用户确认。",
        category: "确认与决策",
        source: "AI anime",
      }],
    }]);
  });

  it("filters by command name or description", () => {
    const commands = [
      { name: "help", description: "List commands" },
      { name: "compact", description: "Compress conversation context" },
    ];

    expect(filterSlashCommands(commands, "comp")).toEqual([commands[1]]);
    expect(filterSlashCommands(commands, "conversation")).toEqual([commands[1]]);
  });

  it("does not leak nested tool matches into the root Slash catalog", () => {
    const commands = [{
      name: "tools",
      description: "查看工具",
      tools: [{
        name: "question",
        label: "向用户提问",
        description: "遇到关键歧义时请求用户确认",
        category: "确认与决策",
        source: "AI anime",
      }],
    }];

    expect(filterSlashCommands(commands, "question")).toEqual([]);
    expect(filterSlashCommands(commands, "关键歧义")).toEqual([]);
  });

  it("keeps dynamically discovered Skills distinct from runtime commands", () => {
    expect(normalizeSlashCommands([
      {
        name: "ai-anime",
        description: "AI 漫剧完整工作流",
        kind: "skill",
        source: "managed",
      },
    ])).toEqual([
      {
        name: "ai-anime",
        description: "AI 漫剧完整工作流",
        kind: "skill",
        source: "managed",
      },
    ]);
  });

  it("distinguishes commands, routed lists, and Skills needing input", () => {
    expect(slashCommandAction({ name: "help", description: "帮助" })).toBe("help-picker");
    expect(slashCommandAction({ name: "model", description: "模型" })).toBe("model-picker");
    expect(slashCommandAction({ name: "tools", description: "工具" })).toBe("tool-picker");
    expect(slashCommandAction({
      name: "ai-anime",
      description: "完整工作流",
      kind: "skill",
    })).toBe("skill-picker");
  });

  it("keeps session-maintenance actions out of the Slash catalog", () => {
    expect(DEFAULT_CHAT_SLASH_COMMANDS.map((item) => item.name)).toEqual([
      "help",
      "model",
      "tools",
    ]);
    expect(normalizeSlashCommands([
      { name: "context", description: "上下文", kind: "command" },
      { name: "reset", description: "清空", kind: "command" },
    ])).toBe(DEFAULT_CHAT_SLASH_COMMANDS);
  });
});
