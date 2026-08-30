// Copyright (c) 2026 AI anime
import {
  ArrowLeft, Blocks, Bot, Brain, Check, CircleHelp, Cloud, Code2,
  FilePenLine, FileSearch, FolderKanban, Images, KeyRound, LoaderCircle,
  Network, Play, Route, ScanSearch, Sparkles, Video, Volume2, Workflow,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type {
  ChatSlashCommand, ChatToolEntry, ModelEntry,
} from "@/modules/ai_assistant/domain/contracts";
import { slashCommandAction } from "@/modules/ai_assistant/domain/slashCommand";
import { formatModelContextWindow } from "@/modules/model_usage/public";
import { cn } from "@/lib/utils";

export type SlashMenuMode =
  | "commands"
  | "help"
  | "models"
  | "tools"
  | "skill";

const COMMAND_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  help: CircleHelp,
  model: Bot,
  tools: Wrench,
};

const TOOL_CATEGORY_ORDER = [
  "确认与决策", "任务与协作", "项目与任务", "剧本与工作流",
  "视觉资产", "声音", "视频与成片", "素材展示", "文件读取",
  "文件修改", "代码与执行", "会话与记忆", "Skills", "视觉理解",
] as const;

const TOOL_CATEGORY_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "确认与决策": CircleHelp,
  "任务与协作": Network,
  "项目与任务": FolderKanban,
  "剧本与工作流": Workflow,
  "视觉资产": Images,
  "声音": Volume2,
  "视频与成片": Video,
  "素材展示": Sparkles,
  "文件读取": FileSearch,
  "文件修改": FilePenLine,
  "代码与执行": Code2,
  "会话与记忆": Brain,
  Skills: Blocks,
  "视觉理解": ScanSearch,
};

function SlashCommandOption({ command, description, onSelect }: {
  command: ChatSlashCommand;
  description: string;
  onSelect: (command: ChatSlashCommand) => void;
}) {
  const isSkill = command.kind === "skill";
  const action = slashCommandAction(command);
  const Icon = isSkill ? Blocks : COMMAND_ICONS[command.name] ?? Sparkles;
  const actionLabel = action === "model-picker"
    ? "选择"
    : action === "tool-picker" || action === "help-picker"
      ? "查看"
      : action === "skill-picker" ? "详情" : "打开";
  return (
    <CommandItem
      value={`${command.kind ?? "command"}:${command.name}`}
      keywords={[command.name, description]}
      className="gap-3"
      aria-label={`/${command.name}：${description}`}
      onSelect={() => onSelect(command)}
    >
      <span className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/75",
        isSkill && "text-primary",
      )}>
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          /{command.name}
          {isSkill ? (
            <span className="rounded border border-primary/20 bg-primary/8 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
              Skill
            </span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        {actionLabel}
      </kbd>
    </CommandItem>
  );
}

function ModelOption({ activeModel, model, onSelect }: {
  activeModel: string | null;
  model: ModelEntry;
  onSelect: (modelId: string) => void;
}) {
  const Icon = model.source === "cloud" ? Cloud : model.source === "byok" ? KeyRound : Route;
  const selected = (activeModel ?? "auto") === model.id;
  return (
    <CommandItem
      value={`model:${model.id}`}
      keywords={[model.label, model.modelId ?? "", model.providerLabel ?? "", model.description ?? ""]}
      className="gap-3 py-2.5"
      aria-label={`${model.label} ${model.providerLabel ?? ""} ${model.description ?? ""}`}
      onSelect={() => onSelect(model.id)}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/80">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{model.label}</span>
          {model.providerLabel ? (
            <span className="shrink-0 rounded border border-border bg-muted/70 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
              {model.providerLabel}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          上下文 {formatModelContextWindow(model.contextWindow)}
          {model.maxOutputTokens
            ? ` · 输出 ${formatModelContextWindow(model.maxOutputTokens)}`
            : ""}
          {model.reasoningEfforts?.length
            ? ` · 思考 ${model.reasoningEfforts.join(" / ")}`
            : " · 思考未声明"}
        </span>
      </span>
      <Check className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
    </CommandItem>
  );
}

function ToolOption({ tool }: { tool: ChatToolEntry }) {
  const Icon = TOOL_CATEGORY_ICONS[tool.category] ?? Wrench;
  return (
    <CommandItem
      value={`tool:${tool.name}`}
      keywords={[tool.name, tool.label, tool.description, tool.category, tool.source]}
      className="items-start gap-3 py-3"
      aria-label={`${tool.label} ${tool.name}：${tool.description}`}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/80 text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{tool.label}</span>
          <code className="break-all rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tool.name}</code>
          <span className="rounded border border-border/70 px-1.5 py-0.5 text-[9px] text-muted-foreground">{tool.source}</span>
        </span>
        <span className="mt-1 block whitespace-normal text-xs leading-5 text-muted-foreground">{tool.description}</span>
      </span>
    </CommandItem>
  );
}

function CommandCatalog({ commands, onSelectCommand }: {
  commands: ChatSlashCommand[];
  onSelectCommand: (command: ChatSlashCommand) => void;
}) {
  const { t } = useTranslation();
  const commandItems = commands.filter((command) => command.kind !== "skill");
  const skillItems = commands.filter((command) => command.kind === "skill");
  const renderCommand = (command: ChatSlashCommand) => (
    <SlashCommandOption
      key={`${command.kind ?? "command"}:${command.name}`}
      command={command}
      description={command.kind === "skill" ? command.description : t(`aiAssistant.slashCommand.${command.name}`, command.description)}
      onSelect={onSelectCommand}
    />
  );
  return (
    <CommandList
      label={t("aiAssistant.slashCommands", "Slash 命令与 Skills")}
      className="max-h-[min(24rem,calc(100vh_-_31.25rem))]"
    >
      <CommandEmpty>{t("aiAssistant.slashNoResults", "没有匹配的命令或 Skill")}</CommandEmpty>
      {commandItems.length > 0 ? (
        <CommandGroup heading={t("aiAssistant.slashCommandGroup", "命令")}>{commandItems.map(renderCommand)}</CommandGroup>
      ) : null}
      {commandItems.length > 0 && skillItems.length > 0 ? <CommandSeparator /> : null}
      {skillItems.length > 0 ? (
        <CommandGroup heading={t("aiAssistant.slashSkillGroup", "Skills")}>{skillItems.map(renderCommand)}</CommandGroup>
      ) : null}
    </CommandList>
  );
}

function SkillRoute({ command, onBack, onUse }: {
  command: ChatSlashCommand;
  onBack: () => void;
  onUse: () => void;
}) {
  const source = command.source === "user" ? "用户 Skill" : "内置 Skill";
  return (
    <div onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onBack();
      }
    }}>
      <PickerHeader label={`/${command.name}`} note={source} onBack={onBack} />
      <div className="space-y-3 p-3.5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/8 text-primary">
            <Blocks className="size-4.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {command.name}
              <span className="rounded border border-primary/20 bg-primary/8 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-primary">Skill</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{command.description || "该 Skill 未提供说明。"}</p>
          </div>
        </div>
        <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/25 p-3 text-xs sm:grid-cols-[7rem_1fr]">
          <span className="text-muted-foreground">加载来源</span><span>{source}</span>
          <span className="text-muted-foreground">输入要求</span><span>{command.inputHint || "补充具体任务说明"}</span>
          <span className="text-muted-foreground">执行方式</span><span>发送后自动加载 Skill 指引，再由助手按指引执行。</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>返回</Button>
          <Button size="sm" onClick={onUse} autoFocus><Play className="size-3.5" />在输入框中使用</Button>
        </div>
      </div>
    </div>
  );
}

export function SlashCommandMenu({
  activeModel, commands, disabled, isFreezoneLayout, listboxId, mode,
  models, modelsLoading, query, selectedCommand, tools, onBack, onQueryChange,
  onSelectCommand, onSelectModel, onUseSkill,
}: {
  activeModel: string | null;
  commands: ChatSlashCommand[];
  disabled: boolean;
  isFreezoneLayout: boolean;
  listboxId: string;
  mode: SlashMenuMode;
  models: ModelEntry[];
  modelsLoading: boolean;
  query: string;
  selectedCommand: ChatSlashCommand | null;
  tools: ChatToolEntry[];
  onBack: () => void;
  onQueryChange: (query: string) => void;
  onSelectCommand: (command: ChatSlashCommand) => void;
  onSelectModel: (modelId: string) => void;
  onUseSkill: () => void;
}) {
  const { t } = useTranslation();
  const automaticModels = models.filter((model) => model.source === "auto");
  const cloudModels = models.filter((model) => model.source === "cloud");
  const byokModels = models.filter((model) => model.source === "byok");
  const toolsByCategory = new Map<string, ChatToolEntry[]>();
  tools.forEach((tool) => {
    const group = toolsByCategory.get(tool.category) ?? [];
    group.push(tool);
    toolsByCategory.set(tool.category, group);
  });
  const toolCategories = [
    ...TOOL_CATEGORY_ORDER.filter((category) => toolsByCategory.has(category)),
    ...Array.from(toolsByCategory.keys()).filter((category) => !TOOL_CATEGORY_ORDER.includes(category as typeof TOOL_CATEGORY_ORDER[number])),
  ];
  const renderModel = (model: ModelEntry) => (
    <ModelOption key={model.id} activeModel={activeModel} model={model} onSelect={onSelectModel} />
  );

  return (
    <div
      id={listboxId}
      className={cn(
        "relative z-50 mx-auto mb-2 w-full max-w-[760px] overflow-hidden rounded-xl border border-border bg-popover/98 text-popover-foreground shadow-xl backdrop-blur-xl",
        isFreezoneLayout && "max-w-none",
      )}
    >
      {mode === "models" ? (
        <>
          <PickerHeader label="选择当前对话模型" note="不修改全局优先级" onBack={onBack} />
          <CommandInput autoFocus value={query} onValueChange={onQueryChange} placeholder="搜索模型或提供方…" aria-label="搜索模型" onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); onBack(); }
          }} />
          <CommandList label="当前对话可用模型" className="max-h-[min(24rem,calc(100vh_-_31.25rem))]">
            {modelsLoading ? <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在读取模型优先级…</div> : null}
            {!modelsLoading ? <CommandEmpty>没有可用于文本对话的模型</CommandEmpty> : null}
            {!modelsLoading && automaticModels.length > 0 ? <CommandGroup heading="推荐">{automaticModels.map(renderModel)}</CommandGroup> : null}
            {!modelsLoading && cloudModels.length > 0 ? <CommandGroup heading="云端模型">{cloudModels.map(renderModel)}</CommandGroup> : null}
            {!modelsLoading && byokModels.length > 0 ? <CommandGroup heading="BYOK 模型">{byokModels.map(renderModel)}</CommandGroup> : null}
          </CommandList>
        </>
      ) : mode === "tools" ? (
        <>
          <PickerHeader label="当前可用工具" note={`${tools.length} 个 · AI 自动调用`} onBack={onBack} />
          <div className="border-b border-border/70 bg-muted/25 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
            工具是助手执行任务时自动选择的能力，不是需要手动发送的 Slash 命令。可按名称、用途或分类搜索。
          </div>
          <CommandInput autoFocus value={query} onValueChange={onQueryChange} placeholder="搜索工具名称、用途或分类…" aria-label="搜索可用工具" onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); onBack(); }
          }} />
          <CommandList label="当前范围可用工具" className="max-h-[min(24rem,calc(100vh_-_31.25rem))]">
            <CommandEmpty>没有匹配的工具</CommandEmpty>
            {toolCategories.map((category) => (
              <CommandGroup key={category} heading={category}>{toolsByCategory.get(category)?.map((tool) => <ToolOption key={tool.name} tool={tool} />)}</CommandGroup>
            ))}
          </CommandList>
        </>
      ) : mode === "help" ? (
        <>
          <PickerHeader
            label="命令与 Skills"
            note={`${commands.filter((item) => item.kind !== "skill").length} 个命令 · ${commands.filter((item) => item.kind === "skill").length} 个 Skills`}
            onBack={onBack}
          />
          <div className="border-b border-border/70 bg-muted/25 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
            选择任一项目进入对应的二级面板；需要参数的 Skill 会先展示完整说明，再回填到输入框。
          </div>
          <CommandInput autoFocus value={query} onValueChange={onQueryChange} placeholder="搜索命令或 Skill…" aria-label="搜索命令或 Skill" onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); onBack(); }
          }} />
          <CommandCatalog commands={commands} onSelectCommand={onSelectCommand} />
        </>
      ) : mode === "skill" && selectedCommand ? (
        <SkillRoute command={selectedCommand} onBack={onBack} onUse={onUseSkill} />
      ) : (
        <>
          <div className="border-b border-border/70 px-3 py-2 text-[11px] font-medium text-muted-foreground">{t("aiAssistant.slashPalette", "命令与 Skills")}</div>
          <CommandCatalog commands={commands} onSelectCommand={onSelectCommand} />
        </>
      )}
      <div className="flex items-center gap-3 border-t border-border/70 px-3 py-1.5 text-[10px] text-muted-foreground">
        {mode === "skill" ? (
          <><span>Esc 返回</span><span>所有操作均在当前对话范围内生效</span></>
        ) : (
          <>
            <span>↑↓ {mode === "tools" ? "浏览" : t("aiAssistant.slashNavigate", "选择")}</span>
            <span>{mode === "tools" ? "输入关键词筛选" : "Enter 打开"}</span>
            <span>Esc {mode === "commands" ? t("aiAssistant.slashClose", "关闭") : "返回"}</span>
          </>
        )}
        {disabled && mode === "models" ? <span className="ml-auto text-amber-600">任务执行中，暂不能切换模型</span> : null}
      </div>
    </div>
  );
}

function PickerHeader({ label, note, onBack }: {
  label: string;
  note: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border/70 px-2 py-1.5">
      <button type="button" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onBack} aria-label="返回上一级">
        <ArrowLeft className="size-4" />
      </button>
      <span className="text-xs font-medium">{label}</span>
      <span className="ml-auto text-[10px] text-muted-foreground">{note}</span>
    </div>
  );
}
