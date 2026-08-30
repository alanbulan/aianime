// Copyright (c) 2026 AI anime
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Gauge,
  ListRestart,
  LoaderCircle,
  PackageSearch,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  ChatSlashCommandResult,
  StructuredSlashCommandName,
} from "@/modules/ai_assistant/domain/contracts";
import { cn } from "@/lib/utils";

type ResultState = {
  status: "idle" | "loading" | "success" | "error";
  text?: string;
  usage?: ChatSlashCommandResult["usage"];
};

type ContextSummary = {
  assistant?: string;
  compression?: string;
  empty: boolean;
  fallback?: string;
  label: string;
  provider?: string;
  route?: string;
  system?: string;
  tool?: string;
  usage?: {
    percent: string;
    percentValue: number;
    total: string;
    used: string;
  };
  user?: string;
};

const IDLE_STATE: ResultState = { status: "idle" };

export function ComposerContextMenu({
  busy,
  connected,
  open,
  onOpenChange,
  onRunCommand,
}: {
  busy: boolean;
  connected: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunCommand: (
    command: StructuredSlashCommandName,
  ) => Promise<ChatSlashCommandResult>;
}) {
  const [contextState, setContextState] = useState<ResultState>(IDLE_STATE);
  const [versionState, setVersionState] = useState<ResultState>(IDLE_STATE);
  const [actionState, setActionState] = useState<ResultState>(IDLE_STATE);
  const [pendingAction, setPendingAction] = useState<"compact" | "reset" | null>(null);
  const requestEpochRef = useRef(0);

  const runInfoCommand = useCallback(async (
    command: "context" | "version",
    epoch: number,
  ) => {
    const setState = command === "context" ? setContextState : setVersionState;
    setState({ status: "loading" });
    try {
      const result = await onRunCommand(command);
      if (requestEpochRef.current !== epoch) return;
      setState({ status: "success", text: result.text, usage: result.usage });
    } catch (error) {
      if (requestEpochRef.current !== epoch) return;
      setState({
        status: "error",
        text: error instanceof Error ? error.message : "读取失败，请重试。",
      });
    }
  }, [onRunCommand]);

  const refreshInfo = useCallback(() => {
    if (!connected || busy) return;
    const epoch = requestEpochRef.current + 1;
    requestEpochRef.current = epoch;
    void runInfoCommand("context", epoch);
    void runInfoCommand("version", epoch);
  }, [busy, connected, runInfoCommand]);

  useEffect(() => {
    if (!open) return;
    setPendingAction(null);
    setActionState(IDLE_STATE);
    refreshInfo();
  }, [open, refreshInfo]);

  useEffect(() => () => {
    requestEpochRef.current += 1;
  }, []);

  const runPendingAction = async () => {
    const command = pendingAction;
    if (!command || busy || !connected) return;
    setActionState({ status: "loading" });
    try {
      const result = await onRunCommand(command);
      setActionState({ status: "success", text: result.text });
      setPendingAction(null);
      const epoch = requestEpochRef.current + 1;
      requestEpochRef.current = epoch;
      void runInfoCommand("context", epoch);
    } catch (error) {
      setActionState({
        status: "error",
        text: error instanceof Error ? error.message : "命令执行失败，请重试。",
      });
    }
  };

  const unavailable = !connected || busy;
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={(
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 rounded-full bg-muted/70 px-2 text-[11px] font-normal text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
            disabled={unavailable}
            aria-label="打开当前对话上下文与运行状态"
            data-composer-context-trigger=""
          />
        )}
      >
        <Gauge className="size-3.5" />
        <span>上下文</span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={6}
        aria-label="当前对话上下文"
        data-composer-context-menu=""
        className="w-[19rem] max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-popover p-0 shadow-xl ring-0"
      >
        <div className="flex h-8 items-center gap-2 border-b border-border/70 px-3">
          <div className="text-xs font-medium">上下文</div>
          <VersionBadge state={versionState} />
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            disabled={unavailable || contextState.status === "loading"}
            onClick={refreshInfo}
            aria-label="刷新上下文与版本状态"
          >
            <RefreshCw className={cn("size-3.5", contextState.status === "loading" && "animate-spin")} />
          </button>
        </div>
        <div className="space-y-1.5 p-2">
          <ContextStatus state={contextState} />

          {actionState.status !== "idle" ? (
            <ActionStatus state={actionState} />
          ) : null}

          {pendingAction ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-2.5 py-2">
              <div className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-amber-900 dark:text-amber-200">
                    {pendingAction === "reset" ? "清空上下文？" : "压缩上下文？"}
                  </div>
                  <p className="text-[10px] leading-4 text-amber-800/75 dark:text-amber-200/70">
                    {pendingAction === "reset"
                      ? "聊天记录保留，仅清空模型记忆"
                      : "聊天记录保留，旧内容转为摘要"}
                  </p>
                </div>
              </div>
              <div className="mt-1.5 flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={actionState.status === "loading"}
                  onClick={() => setPendingAction(null)}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className={cn(
                    "h-7 px-2 text-[11px]",
                    pendingAction === "reset" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  )}
                  disabled={actionState.status === "loading"}
                  onClick={() => void runPendingAction()}
                >
                  {actionState.status === "loading" ? <LoaderCircle className="size-3 animate-spin" /> : null}
                  确认
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <ContextActionButton
                icon={PackageSearch}
                label="压缩"
                tooltip="压缩上下文，聊天记录保持完整"
                disabled={unavailable || actionState.status === "loading"}
                onClick={() => {
                  setActionState(IDLE_STATE);
                  setPendingAction("compact");
                }}
              />
              <ContextActionButton
                icon={ListRestart}
                label="清空"
                tooltip="清空上下文，聊天记录保持完整"
                destructive
                disabled={unavailable || actionState.status === "loading"}
                onClick={() => {
                  setActionState(IDLE_STATE);
                  setPendingAction("reset");
                }}
              />
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContextStatus({ state }: { state: ResultState }) {
  const loading = state.status === "loading";
  const failed = state.status === "error";
  const summary = state.status === "success"
    ? parseContextSummary(state.text ?? "", state.usage)
    : null;
  return (
    <div
      className={cn(
        "rounded-lg border border-border/70 bg-muted/25 px-2.5 py-2 text-[10px] leading-4",
        (loading || failed || !summary) && "min-h-14",
        failed && "border-destructive/25 bg-destructive/7 text-destructive",
      )}
      role={failed ? "alert" : "status"}
    >
      {loading ? (
        <span className="flex h-9 items-center justify-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          读取中…
        </span>
      ) : summary ? (
        <ContextSummaryView summary={summary} />
      ) : failed ? (
        <span className="flex items-start gap-2">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{state.text}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">尚未读取</span>
      )}
    </div>
  );
}

function ContextSummaryView({ summary }: { summary: ContextSummary }) {
  const counts = [
    summary.user !== undefined ? `用户 ${summary.user}` : null,
    summary.assistant !== undefined ? `助手 ${summary.assistant}` : null,
    summary.tool !== undefined ? `工具 ${summary.tool}` : null,
    summary.system !== undefined ? `系统 ${summary.system}` : null,
  ].filter(Boolean).join(" · ");
  const showCounts = counts && !(
    summary.empty
    && [summary.user, summary.assistant, summary.tool, summary.system].every((value) => value === "0")
  );
  const route = [summary.route, summary.provider].filter(Boolean).join(" · ");
  return (
    <div>
      <div className="flex min-w-0 items-center gap-1.5">
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
        <span
          className="font-medium text-foreground"
          data-ui-tooltip={summary.empty
            ? "基础占用包含系统提示词、工具与 Skill 定义；对话历史已清空。"
            : undefined}
        >
          {summary.label}
        </span>
        {summary.usage ? (
          <span className="ml-auto tabular-nums text-muted-foreground">
            {summary.empty ? "基础 " : ""}{summary.usage.percent}%
          </span>
        ) : null}
      </div>
      {summary.usage ? (
        <>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${summary.usage.percentValue}%` }}
              role="progressbar"
              aria-label={summary.empty ? "基础上下文占用" : "上下文占用"}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={summary.usage.percentValue}
            />
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <span className="shrink-0 tabular-nums">
              {summary.empty ? "基础约 " : "约 "}
              {summary.usage.used} / {summary.usage.total} tokens
            </span>
            {summary.compression ? (
              <><span aria-hidden="true">·</span><span className="truncate">{summary.compression}</span></>
            ) : null}
          </div>
        </>
      ) : null}
      {showCounts ? <div className="mt-0.5 text-muted-foreground">{counts}</div> : null}
      {route ? <div className="mt-0.5 truncate text-muted-foreground" data-ui-tooltip={route}>{route}</div> : null}
      {summary.fallback ? (
        <div className="mt-0.5 line-clamp-2 text-muted-foreground" data-ui-tooltip={summary.fallback}>
          {summary.fallback}
        </div>
      ) : null}
    </div>
  );
}

function ActionStatus({ state }: { state: ResultState }) {
  const failed = state.status === "error";
  return (
    <div
      className={cn(
        "flex min-h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-muted/25 px-2.5 text-[10px]",
        failed && "border-destructive/25 bg-destructive/7 text-destructive",
      )}
      role={failed ? "alert" : "status"}
      data-ui-tooltip={state.text}
    >
      {state.status === "loading" ? (
        <><LoaderCircle className="size-3 animate-spin" />执行中…</>
      ) : failed ? (
        <><CircleAlert className="size-3 shrink-0" /><span className="truncate">{compactActionText(state.text)}</span></>
      ) : (
        <><CheckCircle2 className="size-3 shrink-0 text-emerald-600" /><span className="truncate">{compactActionText(state.text)}</span></>
      )}
    </div>
  );
}

function VersionBadge({ state }: { state: ResultState }) {
  if (state.status === "loading") {
    return <LoaderCircle className="ml-auto size-3 animate-spin text-muted-foreground" />;
  }
  const version = state.text?.match(/Hermes\s+v[\w.+-]+/i)?.[0];
  return (
    <span
      className={cn(
        "ml-auto max-w-32 truncate text-[9px] text-muted-foreground",
        state.status === "error" && "text-destructive",
      )}
      data-ui-tooltip={state.text}
    >
      {state.status === "error" ? "版本不可用" : version ?? "Hermes"}
    </span>
  );
}

function parseContextSummary(
  text: string,
  contextUsage?: ChatSlashCommandResult["usage"],
): ContextSummary {
  const empty = /上下文为空/.test(text);
  const messages = text.match(/模型上下文：\s*([\d,]+)\s*条消息/);
  const counts = text.match(/用户\s*([\d,]+)，助手\s*([\d,]+)，工具\s*([\d,]+)，系统\s*([\d,]+)/);
  const usage = normalizeContextUsage(contextUsage);
  const route = text.match(/模型路由：\s*([^\n]+)/)?.[1]?.trim();
  const provider = text.match(/提供方：\s*([^\n]+)/)?.[1]?.trim();
  const compressionDistance = text.match(/距阈值约\s*([\d,]+)\s*tokens/i)?.[1];
  const compression = compressionDistance
    ? `距压缩 ${compactTokenCount(compressionDistance)}`
    : /已达到阈值/.test(text)
      ? "可压缩"
      : /未启用上下文压缩/.test(text)
        ? "未启用压缩"
        : undefined;
  const knownLine = /^(当前模型上下文为空|模型上下文：|用户\s|模型路由：|提供方：|上下文占用：|压缩状态：|压缩阈值：|提示：)/;
  const fallback = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !knownLine.test(line))
    .join(" · ");
  return {
    empty,
    label: empty ? "对话历史已清空" : messages ? `${compactTokenCount(messages[1])} 条消息` : "上下文",
    ...(counts ? {
      user: compactTokenCount(counts[1]),
      assistant: compactTokenCount(counts[2]),
      tool: compactTokenCount(counts[3]),
      system: compactTokenCount(counts[4]),
    } : {}),
    ...(usage ? {
      usage: {
        used: compactTokenCount(String(usage.used)),
        total: compactTokenCount(String(usage.size)),
        percent: usage.percent.toFixed(1),
        percentValue: Math.max(0, Math.min(100, usage.percent)),
      },
    } : {}),
    ...(route ? { route: route.replace("由当前对话选择决定", "当前对话路由") } : {}),
    ...(provider ? { provider: provider.replace("统一模型网关", "统一网关") } : {}),
    ...(compression ? { compression } : {}),
    ...(fallback ? { fallback } : {}),
  };
}

function normalizeContextUsage(
  usage?: ChatSlashCommandResult["usage"],
): { percent: number; size: number; used: number } | null {
  if (!usage) return null;
  if (!Number.isFinite(usage.used) || usage.used < 0) return null;
  if (!Number.isFinite(usage.size) || usage.size <= 0) return null;
  return {
    used: usage.used,
    size: usage.size,
    percent: (usage.used / usage.size) * 100,
  };
}

function compactTokenCount(value: string): string {
  const normalized = value.replace(/,/g, "");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 1_000) return normalized;
  const scaled = number / 1_000;
  const digits = scaled >= 100 ? 0 : 1;
  return `${scaled.toFixed(digits).replace(/\.0$/, "")}k`;
}

function compactActionText(text?: string): string {
  const value = text?.trim() || "操作完成";
  if (value.includes("没有可压缩")) return "无需压缩";
  if (value.includes("已清空当前对话的模型上下文")) return "已清空 · 聊天记录保留";
  return value.replace(/[。；]$/, "");
}

function ContextActionButton({
  destructive = false,
  disabled,
  icon: Icon,
  label,
  onClick,
  tooltip,
}: {
  destructive?: boolean;
  disabled: boolean;
  icon: typeof Gauge;
  label: string;
  onClick: () => void;
  tooltip: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background/60 px-2 text-[11px] font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
        destructive && "hover:border-destructive/25 hover:bg-destructive/7",
      )}
      disabled={disabled}
      onClick={onClick}
      aria-label={tooltip}
    >
      <Icon className={cn("size-3.5 text-muted-foreground", destructive && "text-destructive")} />
      {label}
    </button>
  );
}
