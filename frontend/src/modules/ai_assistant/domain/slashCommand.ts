// Copyright (c) 2026 AI anime
import type {
  ChatSlashCommand,
  ChatToolEntry,
} from "@/modules/ai_assistant/domain/contracts";

export const DEFAULT_CHAT_SLASH_COMMANDS: ChatSlashCommand[] = [
  {
    name: "model",
    description: "选择仅对当前对话生效的模型路由",
    kind: "command",
  },
  {
    name: "tools",
    description: "查看当前助手实际可调用的工具",
    kind: "command",
  },
];

const HIDDEN_RUNTIME_COMMAND_NAMES = new Set([
  "compact",
  "context",
  "queue",
  "reset",
  "steer",
  "version",
]);

const CORE_COMMAND_NAMES = new Set(
  DEFAULT_CHAT_SLASH_COMMANDS.map((command) => command.name),
);

export type SlashCommandAction =
  | "model-picker"
  | "tool-picker"
  | "skill-picker";

export function slashCommandAction(
  command: ChatSlashCommand,
): SlashCommandAction {
  if (command.kind === "skill") {
    return "skill-picker";
  }
  if (command.name === "model") {
    return "model-picker";
  }
  if (command.name === "tools") {
    return "tool-picker";
  }
  if (command.inputHint) {
    return "skill-picker";
  }
  return "skill-picker";
}

export function normalizeSlashCommands(value: unknown): ChatSlashCommand[] {
  if (!Array.isArray(value)) return DEFAULT_CHAT_SLASH_COMMANDS;
  const commands = value.flatMap((entry): ChatSlashCommand[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const name = typeof item.name === "string"
      ? item.name.trim().replace(/^\//, "")
      : "";
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return [];
    if (HIDDEN_RUNTIME_COMMAND_NAMES.has(name)) return [];
    const description = typeof item.description === "string"
      ? item.description.trim()
      : "";
    const input = item.input && typeof item.input === "object"
      ? item.input as Record<string, unknown>
      : null;
    const inputHint = typeof input?.hint === "string"
      ? input.hint.trim()
      : typeof item.input_hint === "string"
        ? item.input_hint.trim()
        : typeof item.inputHint === "string"
          ? item.inputHint.trim()
          : "";
    const kind = item.kind === "skill"
      ? "skill"
      : item.kind === "command" || CORE_COMMAND_NAMES.has(name)
        ? "command"
        : "skill";
    if (kind === "command" && !CORE_COMMAND_NAMES.has(name)) return [];
    const source = item.source === "managed" || item.source === "user"
      ? item.source
      : undefined;
    const tools = normalizeToolEntries(item.tools);
    return [{
      name,
      description,
      kind,
      ...(inputHint ? { inputHint } : {}),
      ...(source ? { source } : {}),
      ...(tools.length > 0 ? { tools } : {}),
    }];
  });
  return commands.length > 0 ? commands : DEFAULT_CHAT_SLASH_COMMANDS;
}

export function slashCommandQuery(draft: string): string | null {
  const match = draft.match(/^\/([^\s/]*)$/);
  return match ? (match[1] ?? "").toLowerCase() : null;
}

export function filterSlashCommands(
  commands: ChatSlashCommand[],
  query: string,
): ChatSlashCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands;
  return commands.filter((command) => (
    command.name.toLowerCase().includes(normalized)
    || command.description.toLowerCase().includes(normalized)
  ));
}

function normalizeToolEntries(value: unknown): ChatToolEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry): ChatToolEntry[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(name) || seen.has(name)) return [];
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const description = typeof item.description === "string"
      ? item.description.trim()
      : "";
    const category = typeof item.category === "string" ? item.category.trim() : "";
    const source = typeof item.source === "string" ? item.source.trim() : "";
    if (!label || !description || !category || !source) return [];
    seen.add(name);
    return [{ name, label, description, category, source }];
  });
}
