// Copyright (c) 2026 AI anime
import {
  Check,
  ChevronDown,
  Cloud,
  BrainCircuit,
  KeyRound,
  LoaderCircle,
  Route,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ModelEntry } from "@/modules/ai_assistant/domain/contracts";
import {
  formatModelContextWindow,
  formatReasoningEffortOption,
} from "@/modules/model_usage/public";
import { cn } from "@/lib/utils";

export function ComposerModelMenu({
  activeModel,
  activeReasoningEffort,
  busy,
  connected,
  models,
  modelsLoading,
  open,
  onOpenChange,
  onSelectModel,
  onSelectReasoningEffort,
}: {
  activeModel: string | null;
  activeReasoningEffort: string | null;
  busy: boolean;
  connected: boolean;
  models: ModelEntry[];
  modelsLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectModel: (modelId: string) => void;
  onSelectReasoningEffort: (reasoningEffort: string) => void;
}) {
  const activeModelId = activeModel ?? "auto";
  const selectedModel = models.find((model) => model.id === activeModelId);
  const reasoningEfforts = selectedModel?.reasoningEfforts?.length
    ? selectedModel.reasoningEfforts
    : [];
  const preferredAutomaticModel = models.find((model) => model.source !== "auto");
  const automaticRouting = activeModelId === "auto";
  const selectedReasoningEffort = activeReasoningEffort
    ?? selectedModel?.defaultReasoningEffort
    ?? null;
  const compactModelLabel = automaticRouting
    ? preferredAutomaticModel
      ? `自动 · ${preferredAutomaticModel.label || preferredAutomaticModel.id}`
      : "自动"
    : selectedModel?.label || activeModelId;
  const compactSelectionLabel = selectedReasoningEffort
    ? `${compactModelLabel} · ${formatReasoningEffortOption(selectedReasoningEffort)}`
    : compactModelLabel;
  const modelRouteTooltip = automaticRouting
    ? preferredAutomaticModel
      ? `自动路由：遵循设置中的模型优先级，当前首选 ${preferredAutomaticModel.label || preferredAutomaticModel.id}`
      : "自动路由：遵循设置中的模型优先级"
    : `当前对话固定使用 ${selectedModel?.label || activeModelId}，不修改全局模型优先级`;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={(
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 min-w-0 max-w-[168px] shrink gap-1 rounded-full bg-muted/70 px-2.5 text-[11px] font-normal text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
            disabled={!connected || busy}
            aria-label={`选择当前对话模型。${modelRouteTooltip}`}
            data-ui-tooltip={modelRouteTooltip}
            data-composer-model-trigger=""
          />
        )}
      >
        {modelsLoading ? (
          <LoaderCircle className="size-3 shrink-0 animate-spin" />
        ) : null}
        <span className="min-w-0 truncate">{compactSelectionLabel}</span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={6}
        aria-label="当前对话模型"
        data-composer-model-menu=""
        className="max-h-80 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-popover p-1.5 shadow-xl ring-0"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between px-2 py-1 text-[11px] font-medium text-foreground">
            <span>模型</span>
            <span className="font-normal text-muted-foreground">仅当前对话</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-1" />
        {models.length === 0 ? (
          <DropdownMenuItem disabled className="min-h-9 px-2 text-xs">
            {modelsLoading ? "正在读取模型…" : "没有可用模型"}
          </DropdownMenuItem>
        ) : (
          models.map((model) => {
            const Icon = model.source === "cloud"
              ? Cloud
              : model.source === "byok"
                ? KeyRound
                : Route;
            const selected = activeModelId === model.id;
            return (
              <DropdownMenuItem
                key={model.id}
                disabled={busy || modelsLoading}
                className="min-h-11 gap-2 rounded-lg px-2 py-1.5 text-xs"
                data-ui-tooltip={model.description}
                onClick={() => onSelectModel(model.id)}
              >
                <Icon className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {model.source === "auto" ? "自动" : model.label || model.id}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    上下文 {formatModelContextWindow(model.contextWindow)}
                    {model.maxOutputTokens
                      ? ` · 输出 ${formatModelContextWindow(model.maxOutputTokens)}`
                      : ""}
                    {model.reasoningEfforts?.length
                      ? ` · 思考 ${model.reasoningEfforts.map(formatReasoningEffortOption).join(" / ")}`
                      : " · 思考未声明"}
                  </span>
                </span>
                {model.providerLabel ? (
                  <span className="max-w-20 truncate text-[10px] text-muted-foreground">
                    {model.providerLabel}
                  </span>
                ) : null}
                <Check
                  className={cn(
                    "size-3.5 text-foreground",
                    selected ? "opacity-100" : "opacity-0",
                  )}
                />
              </DropdownMenuItem>
            );
          })
        )}
        {reasoningEfforts.length ? (
          <>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-foreground">
                <BrainCircuit className="size-3.5" />
                <span>思考力度</span>
                {selectedModel?.defaultReasoningEffort ? (
                  <span className="ml-auto font-normal text-muted-foreground">
                    默认 {formatReasoningEffortOption(selectedModel.defaultReasoningEffort)}
                  </span>
                ) : null}
              </DropdownMenuLabel>
              {reasoningEfforts.map((effort) => (
                <DropdownMenuItem
                  key={effort}
                  disabled={busy || modelsLoading}
                  className="min-h-8 rounded-lg px-2 py-1 text-xs"
                  onClick={() => onSelectReasoningEffort(effort)}
                >
                  <span className="flex-1">{formatReasoningEffortOption(effort)}</span>
                  <Check
                    className={cn(
                      "size-3.5",
                      selectedReasoningEffort === effort
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
