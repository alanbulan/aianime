// Copyright (c) 2026 AI anime
import {
  CheckCircle2,
  ChevronRight,
  CircleX,
  Copy,
  File as FileIcon,
  Image,
  ListTodo,
  LoaderCircle,
  Maximize2,
  Pin,
  PinOff,
  Timer,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import { memo, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  assistantCompletionTextEnd,
  errorTextRanges,
  isAssistantCompletionNotice,
  isAssistantErrorReply,
  isHistoricalToolMessage,
  isToolMessage,
  normalizeMessageText,
} from "@/modules/ai_assistant/domain/messagePresentationRules";
import type {
  ChatAttachment,
  ChatMessage,
} from "@/modules/ai_assistant/domain/contracts";
import { toolDisplayName } from "@/modules/ai_assistant/domain/toolDisplayName";
import { resolveQiuQiuEmotion } from "@/modules/ai_assistant/domain/qiuQiuEmotion";
import {
  extractStructuredBlocks,
  isUiSpec,
  looksLikeStructuredRenderText,
  type StructuredBlock,
} from "@/modules/ai_assistant/domain/structuredContent";
import { JsonNode } from "@/modules/ai_assistant/presentation/StructuredJsonView";
import { UiSpecRenderer } from "@/modules/ai_assistant/presentation/SpecMediaGallery";
import type { SpecMediaDetail } from "@/modules/ai_assistant/presentation/SpecMediaModals";
import { QiuQiuAvatar } from "@/modules/ai_assistant/presentation/QiuQiuAvatar";
import { cn } from "@/lib/utils";
import { writeTextToClipboard } from "@/shared/platform/text-clipboard";

function PlainMessageText({ text }: { text: string }) {
  const paragraphs = normalizeMessageText(text)
    .split(/\n{2}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <div className="min-w-0 space-y-2 whitespace-normal break-words [overflow-wrap:anywhere] leading-relaxed">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 12)}`} className="whitespace-pre-wrap">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function MarkdownMessageText({ text }: { text: string }) {
  const normalized = normalizeMessageText(text);
  if (!normalized) return null;

  return (
    <div
      data-testid="message-markdown"
      className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-lg font-semibold leading-7 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-base font-semibold leading-6 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 mt-2.5 text-sm font-semibold leading-6 first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="my-1.5 whitespace-normal break-words [overflow-wrap:anywhere] first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.92em]">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 max-w-full overflow-x-auto rounded-md border border-border bg-muted p-2 text-xs leading-5">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-4 border-0 border-t border-border" />,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div
              data-testid="message-markdown-table-scroll"
              className="my-2 max-w-full overflow-x-auto"
            >
              <table className="min-w-full border-collapse text-left">{children}</table>
            </div>
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

function MessageText({
  text,
  markdown = false,
}: {
  text: string;
  markdown?: boolean;
}) {
  return markdown
    ? <MarkdownMessageText text={text} />
    : <PlainMessageText text={text} />;
}

function toolValueText(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ToolActivityCard({
  message,
  historical = false,
  grouped = false,
}: {
  message: ChatMessage;
  historical?: boolean;
  grouped?: boolean;
}) {
  const { t } = useTranslation();
  const state = message.toolState ?? "success";
  const title = toolDisplayName(message.toolName ?? message.text.split("\n", 1)[0] ?? "");
  const input = toolValueText(message.toolInput);
  const output = toolValueText(message.toolOutput);
  const error = toolValueText(message.toolError);
  const stateLabel = state === "running"
    ? t("aiAssistant.toolRunning", "执行中")
    : state === "pending"
      ? t("aiAssistant.toolPending", "任务仍在运行")
    : state === "error"
      ? t("aiAssistant.toolFailed", "失败")
      : t("aiAssistant.toolCompleted", "已完成");

  return (
    <div className="min-w-[280px] max-w-full" data-tool-state={state}>
      {historical ? (
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("aiAssistant.historyTool")}
        </div>
      ) : null}
      <div className={cn("flex items-center gap-2", !grouped && "pr-24")}>
        {state === "running" ? (
          <LoaderCircle className="size-4 animate-spin text-primary" />
        ) : state === "pending" ? (
          <Timer className="size-4 text-warning" />
        ) : state === "error" ? (
          <CircleX className="size-4 text-destructive" />
        ) : (
          <CheckCircle2 className="size-4 text-success" />
        )}
        <div className="min-w-0 flex-1 truncate font-medium">{title}</div>
        <Badge
          variant="outline"
          className={cn(
            "h-5 shrink-0 rounded-md px-1.5 text-[10px]",
            state === "error" && "border-destructive/30 bg-destructive/8 text-destructive",
            state === "pending" && "border-warning/30 bg-warning/8 text-warning",
            state === "success" && "border-success/30 bg-success/8 text-success",
          )}
        >
          {stateLabel}
        </Badge>
      </div>

      {error ? (
        <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/8 px-2.5 py-2 text-xs leading-5 text-destructive">
          {error}
        </div>
      ) : null}

      {input || output ? (
        <details className="group/tool-details mt-2 rounded-md border border-border/70 bg-background/55">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground outline-none hover:text-foreground">
            <ChevronRight className="size-3.5 transition-transform group-open/tool-details:rotate-90" />
            {t("aiAssistant.toolDetails", "查看调用详情")}
          </summary>
          <div className="space-y-2 border-t border-border/70 px-2.5 py-2">
            {input ? (
              <ToolDetailValue label={t("aiAssistant.toolInput", "输入")} value={input} />
            ) : null}
            {output ? (
              <ToolDetailValue label={t("aiAssistant.toolOutput", "输出")} value={output} />
            ) : null}
          </div>
        </details>
      ) : state === "running" || state === "pending" ? (
        <div className="mt-1.5 text-xs text-muted-foreground">
          {state === "pending"
            ? t("aiAssistant.toolPendingDescription", "等待窗口已结束，后台任务仍在运行。")
            : t("aiAssistant.toolWaiting", "正在等待工具返回结果…")}
        </div>
      ) : null}
    </div>
  );
}

export function ToolExecutionList({ messages }: { messages: ChatMessage[] }) {
  const { t } = useTranslation();
  if (messages.length === 0) return null;
  const avatarMessage = [...messages].reverse().find(
    (message) => message.toolState === "running",
  ) ?? [...messages].reverse().find(
    (message) => message.toolState === "pending",
  ) ?? [...messages].reverse().find(
    (message) => message.toolState === "error",
  ) ?? messages[messages.length - 1];
  let completed = 0;
  let failed = 0;
  for (const message of messages) {
    if (message.toolState === "success") completed += 1;
    else if (message.toolState === "error") failed += 1;
  }
  const running = messages.length - completed - failed;

  return (
    <div className="flex items-start gap-3">
      <QiuQiuAvatar
        decorative
        emotionId={resolveQiuQiuEmotion(avatarMessage)}
        label="球球"
      />
      <section
        className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        aria-label={t("aiAssistant.toolPlan", "任务执行清单")}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/45 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <ListTodo className="size-4 shrink-0 text-primary" />
            <span>{t("aiAssistant.toolPlan", "任务执行清单")}</span>
          </div>
          <div className="shrink-0 text-xs text-muted-foreground">
            {running > 0
              ? t("aiAssistant.toolPlanProgress", {
                  defaultValue: "{{completed}}/{{total}} 已完成",
                  completed,
                  total: messages.length,
                })
              : failed > 0
                ? t("aiAssistant.toolPlanFailed", {
                    defaultValue: "{{failed}} 项失败",
                    failed,
                  })
                : t("aiAssistant.toolPlanDone", {
                    defaultValue: "{{total}} 项已完成",
                    total: messages.length,
                  })}
          </div>
        </header>
        <div className="divide-y divide-border">
          {messages.map((message, index) => (
            <div
              key={message.id}
              className="flex gap-2 px-3 py-3 [contain-intrinsic-size:auto_96px] [content-visibility:auto]"
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <ToolActivityCard message={message} grouped />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ToolDetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-56 max-w-full overflow-auto whitespace-pre-wrap break-all rounded bg-muted px-2 py-1.5 font-mono text-[11px] leading-4 text-foreground">
        {value}
      </pre>
    </div>
  );
}

function HighlightedErrorText({ text }: { text: string }) {
  const ranges = errorTextRanges(text);
  if (ranges.length === 0) return <MessageText text={text} markdown />;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], index) => {
    if (start > cursor) {
      nodes.push(<MessageText key={`normal-${index}`} text={text.slice(cursor, start)} markdown />);
    }
    nodes.push(
      <span key={`error-${index}`} className="text-destructive">
        {text.slice(start, end)}
      </span>,
    );
    cursor = Math.max(cursor, end);
  });
  if (cursor < text.length) {
    nodes.push(<MessageText key="normal-tail" text={text.slice(cursor)} markdown />);
  }
  return <div className="space-y-1.5">{nodes}</div>;
}

function HighlightedCompletionText({ text }: { text: string }) {
  const end = assistantCompletionTextEnd(text);
  if (end === null) return <MessageText text={text} markdown />;
  return (
    <div className="break-words leading-relaxed whitespace-pre-wrap">
      <span className="text-success">{text.slice(0, end)}</span>
      <span>{text.slice(end)}</span>
    </div>
  );
}

export function DotsIndicator({
  label,
  dotClassName = "size-1.5",
}: {
  label?: string;
  dotClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2" aria-live="polite" aria-label={label}>
      <span className="flex items-center gap-1">
        <span className={cn(dotClassName, "rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]")} />
        <span className={cn(dotClassName, "rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]")} />
        <span className={cn(dotClassName, "rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]")} />
      </span>
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}

function ChatAvatarFrame({
  message,
  label,
  streaming = false,
}: {
  message: ChatMessage;
  label?: string;
  streaming?: boolean;
}) {
  const isAssistant = message.role === "assistant";
  const isTool = isToolMessage(message);
  const isAiActor = isAssistant || isTool;
  const initial = label?.trim().charAt(0).toUpperCase() || "U";
  const emotionId = resolveQiuQiuEmotion(message, streaming);

  return (
    <div
      className={cn(
        "relative flex shrink-0 select-none items-center justify-center overflow-visible rounded-full border text-xs font-medium shadow-sm",
        isAiActor ? "size-11" : "size-10",
        isAiActor
          ? "border-transparent bg-transparent text-muted-foreground shadow-none"
          : "border-primary/20 bg-primary text-primary-foreground",
      )}
      aria-hidden="true"
    >
      {isAiActor ? (
        <QiuQiuAvatar
          className="size-full"
          decorative
          emotionId={emotionId}
          label="球球"
        />
      ) : (
        initial
      )}
    </div>
  );
}

export function StructuredRenderer({
  blocks,
  onOpenMedia,
}: {
  blocks: StructuredBlock[];
  onOpenMedia?: (detail: SpecMediaDetail) => void;
}) {
  const { t } = useTranslation();
  if (blocks.length === 0) return null;
  return (
    <div className="mt-3 flex w-full min-w-0 max-w-full flex-col items-stretch gap-3">
      {blocks.map((block) => {
        if (isUiSpec(block.value)) {
          return (
            <section
              key={block.id}
              className="w-full min-w-0 max-w-full flex-none overflow-visible [contain:layout]"
            >
              <UiSpecRenderer spec={block.value} onOpenMedia={onOpenMedia} />
            </section>
          );
        }
        return (
          <section
            key={block.id}
            className="w-full min-w-0 max-w-full rounded-lg border border-border bg-muted p-2 [contain:layout]"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] uppercase">
                {block.label}
              </Badge>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  void writeTextToClipboard(JSON.stringify(block.value, null, 2))
                    .then(() => toast.success(t("aiAssistant.copySuccess")))
                    .catch(() => toast.error(t("aiAssistant.copyFailed")));
                }}
                aria-label={t("aiAssistant.copyJson")}
              >
                <Copy className="size-3" />
              </Button>
            </div>
            <JsonNode value={block.value} />
          </section>
        );
      })}
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  variant = "default",
  onOpenDetail,
  onOpenMedia,
  pinned,
  excluded = false,
  onDelete,
  onTogglePin,
  deferStructuredRender = false,
  streaming = false,
}: {
  message: ChatMessage;
  variant?: "default" | "freezone";
  onOpenDetail: (message: ChatMessage) => void;
  onOpenMedia: (detail: SpecMediaDetail) => void;
  pinned: boolean;
  excluded?: boolean;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  deferStructuredRender?: boolean;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  const isTool = isToolMessage(message);
  const isHistoricalTool = isTool && isHistoricalToolMessage(message);
  const isFreezoneLayout = variant === "freezone";
  const isErrorReply = isAssistantErrorReply(message);
  const isCompletionNotice = isAssistantCompletionNotice(message);
  const { t } = useTranslation();
  const [excludeConfirmOpen, setExcludeConfirmOpen] = useState(false);
  const shouldWaitForStructuredRender =
    deferStructuredRender && !isUser && !isTool && looksLikeStructuredRenderText(message.text);
  const { displayText, blocks } = extractStructuredBlocks(message);
  const copyText = async () => {
    try {
      await writeTextToClipboard(message.text);
      toast.success(t("aiAssistant.copySuccess"));
    } catch {
      toast.error(t("aiAssistant.copyFailed"));
    }
  };
  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(message.text));
  };
  const userActionButtonClass =
    "size-7 rounded-md text-foreground/70 opacity-100 hover:bg-muted hover:text-foreground";
  const userActionIconClass = "size-3.5 stroke-[2.25]";
  const pinLabel = pinned
    ? t("aiAssistant.unpinContext", "取消固定完整内容")
    : t("aiAssistant.pinContext", "固定完整内容，压缩时保留原文");
  const excludeLabel = excluded
    ? t("aiAssistant.restoreContext", "恢复到 AI 上下文")
    : t("aiAssistant.excludeContext", "从 AI 上下文排除（不删除记录）");
  const handleContextExclusion = () => {
    if (excluded) {
      onDelete(message.id);
      return;
    }
    setExcludeConfirmOpen(true);
  };
  const excludeDialog = (
    <AlertDialog open={excludeConfirmOpen} onOpenChange={setExcludeConfirmOpen}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("aiAssistant.excludeContextConfirmTitle", "从 AI 上下文排除此消息？")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "aiAssistant.excludeContextConfirmDescription",
              "聊天记录和底层数据库不会删除，但 AI 后续回答将不再使用这条消息。你可以随时恢复。",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel", "取消")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setExcludeConfirmOpen(false);
              onDelete(message.id);
            }}
          >
            {t("aiAssistant.excludeContextConfirmAction", "排除")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  const actions = (
    <div
      className={cn(
        isUser
          ? "pointer-events-none absolute right-[calc(100%+8px)] top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 whitespace-nowrap rounded-full border border-border/70 bg-background/85 px-1 py-0.5 text-foreground/75 opacity-0 shadow-sm backdrop-blur transition-opacity after:absolute after:-right-2 after:top-0 after:h-full after:w-2 after:content-[''] group-hover/message-actions:pointer-events-auto group-hover/message-actions:opacity-100 group-focus-within/message-actions:pointer-events-auto group-focus-within/message-actions:opacity-100"
          : "mt-2 flex items-center gap-1 text-muted-foreground/70",
      )}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn("opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100", isUser && userActionButtonClass)}
        onClick={copyText}
        aria-label={t("aiAssistant.copy")}
        data-ui-tooltip={t("aiAssistant.copy")}
      >
        <Copy className={cn("size-3.5", isUser && userActionIconClass)} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn("opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100", isUser && userActionButtonClass)}
        onClick={speak}
        aria-label={t("aiAssistant.speak", "朗读")}
        data-ui-tooltip={t("aiAssistant.speak", "朗读")}
      >
        <Volume2 className={cn("size-3.5", isUser && userActionIconClass)} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn("opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100", isUser && userActionButtonClass)}
        onClick={() => onOpenDetail(message)}
        aria-label={t("aiAssistant.details", "查看完整内容")}
        data-ui-tooltip={t("aiAssistant.details", "查看完整内容")}
      >
        <Maximize2 className={cn("size-3.5", isUser && userActionIconClass)} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn("opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100", isUser && userActionButtonClass)}
        onClick={() => onTogglePin(message.id)}
        aria-label={pinLabel}
        aria-pressed={pinned}
        data-ui-tooltip={pinLabel}
      >
        {pinned ? <PinOff className={cn("size-3.5", isUser && userActionIconClass)} /> : <Pin className={cn("size-3.5", isUser && userActionIconClass)} />}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn("opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100", isUser && userActionButtonClass)}
        onClick={handleContextExclusion}
        aria-label={excludeLabel}
        aria-pressed={excluded}
        data-ui-tooltip={excludeLabel}
      >
        {excluded
          ? <Undo2 className={cn("size-3.5", isUser && userActionIconClass)} />
          : <X className={cn("size-3.5", isUser && userActionIconClass)} />}
      </Button>
      {excludeDialog}
    </div>
  );

  if (isUser) {
    return (
      <div className="flex justify-end">
        <article
          data-context-state={excluded ? "excluded" : pinned ? "pinned" : "normal"}
          className={cn(
            "max-w-[72%]",
            isFreezoneLayout && "max-w-[82%]",
            excluded && "opacity-65",
          )}
        >
          <div className="group/message-actions">
            <div
              className={cn(
                "relative rounded-[14px] border border-border bg-muted px-4 py-2.5 text-sm leading-6 text-foreground shadow-none",
              )}
            >
              {actions}
              {excluded && (
                <Badge variant="outline" className="mb-2 h-5 border-dashed text-[10px] text-muted-foreground">
                  {t("aiAssistant.contextExcluded", "已从 AI 上下文排除")}
                </Badge>
              )}
              <AttachmentList attachments={message.attachments} align="end" />
              {displayText && (
                <div className="whitespace-pre-wrap break-words">{displayText}</div>
              )}
              <StructuredRenderer blocks={blocks} />
            </div>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <ChatAvatarFrame
          message={message}
          label={message.displayName || t("aiAssistant.title")}
          streaming={streaming}
        />
      )}
      <div className={cn("flex min-w-0 flex-1", isUser ? "justify-end" : "justify-start")}>
        <article
          data-context-state={excluded ? "excluded" : pinned ? "pinned" : "normal"}
          className={cn(
            "group relative text-sm leading-6 shadow-none",
            blocks.length > 0 && !isUser && !isTool
              ? "w-full min-w-0 overflow-visible"
              : "w-fit min-w-0 max-w-full overflow-visible",
            isTool
              ? "max-w-[86%] rounded-[14px] border border-warning/20 bg-warning/10 px-4 pb-3 pt-2 text-card-foreground"
              : isUser
                ? "max-w-[86%] rounded-[14px] bg-muted px-4 pb-3 pt-2 text-foreground"
                : "max-w-full rounded-[14px] border border-border bg-card px-4 pb-3 pt-2 text-foreground",
            excluded && "border-dashed opacity-65",
          )}
        >
        <div className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex translate-y-0.5 items-center gap-0.5 rounded-full border border-border/70 bg-background/85 px-1 py-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-70 hover:opacity-100"
            onClick={copyText}
            aria-label={t("aiAssistant.copy")}
            data-ui-tooltip={t("aiAssistant.copy")}
          >
            <Copy className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-70 hover:opacity-100"
            onClick={speak}
            aria-label={t("aiAssistant.speak", "朗读")}
            data-ui-tooltip={t("aiAssistant.speak", "朗读")}
          >
            <Volume2 className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-70 hover:opacity-100"
            onClick={() => onOpenDetail(message)}
            aria-label={t("aiAssistant.details", "查看完整内容")}
            data-ui-tooltip={t("aiAssistant.details", "查看完整内容")}
          >
            <Maximize2 className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-70 hover:opacity-100"
            onClick={() => onTogglePin(message.id)}
            aria-label={pinLabel}
            aria-pressed={pinned}
            data-ui-tooltip={pinLabel}
          >
            {pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-70 hover:opacity-100"
            onClick={handleContextExclusion}
            aria-label={excludeLabel}
            aria-pressed={excluded}
            data-ui-tooltip={excludeLabel}
          >
            {excluded ? <Undo2 className="size-3" /> : <X className="size-3" />}
          </Button>
          {excludeDialog}
        </div>
        {!isTool && message.displayName && !isUser && (
          <div className="mb-1 flex items-center gap-2 pr-28">
            {message.displayName && !isUser ? (
              <div className="text-[11px] font-medium text-muted-foreground">
                {message.displayName}
              </div>
            ) : null}
          </div>
        )}
        {excluded && (
          <Badge variant="outline" className="mb-2 h-5 border-dashed text-[10px] text-muted-foreground">
            {t("aiAssistant.contextExcluded", "已从 AI 上下文排除")}
          </Badge>
        )}
        <AttachmentList attachments={message.attachments} />
        {isTool ? (
          <ToolActivityCard message={message} historical={isHistoricalTool} />
        ) : shouldWaitForStructuredRender ? (
          <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground" aria-live="polite">
            <span>{t("aiAssistant.waitingStructuredRender")}</span>
            <DotsIndicator />
          </div>
        ) : (
          <>
            {displayText && (
              isErrorReply && !isUser && !isTool
                ? <HighlightedErrorText text={displayText} />
                : isCompletionNotice && !isUser && !isTool
                  ? <HighlightedCompletionText text={displayText} />
                  : <MessageText text={displayText} markdown={!isUser && !isTool} />
            )}
            <StructuredRenderer blocks={blocks} onOpenMedia={onOpenMedia} />
          </>
        )}
        </article>
      </div>
      {isUser && (
        <ChatAvatarFrame
          message={message}
          label={message.displayName}
        />
      )}
    </div>
  );
});

function AttachmentList({
  attachments,
  align = "start",
}: {
  attachments?: ChatAttachment[];
  align?: "start" | "end";
}) {
  const visibleAttachments = attachments?.filter(shouldRenderAttachmentChip) ?? [];
  if (visibleAttachments.length === 0) return null;

  return (
    <div className={cn("mb-2 flex flex-wrap gap-1.5", align === "end" && "justify-end")}>
      {visibleAttachments.map((attachment) => (
        <AttachmentChip key={attachment.id || attachment.fileName || attachment.content} attachment={attachment} />
      ))}
    </div>
  );
}

function AttachmentChip({ attachment }: { attachment: ChatAttachment }) {
  const isImage = isImageAttachment(attachment);

  return (
    <span className="inline-flex max-w-44 items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs">
      {isImage ? <Image className="size-3.5" /> : <FileIcon className="size-3.5" />}
      <span className="truncate">{attachment.fileName || attachment.mimeType || "Attachment"}</span>
    </span>
  );
}

function shouldRenderAttachmentChip(attachment: ChatAttachment): boolean {
  if (!isImageAttachment(attachment) && !isVideoAttachment(attachment)) return true;
  return false;
}

function isImageAttachment(attachment: ChatAttachment): boolean {
  return (
    attachment.mimeType?.startsWith("image/")
    || attachment.type === "image"
    || attachment.kind === "image"
    || /\.(avif|gif|jpe?g|png|webp)$/i.test(attachment.fileName ?? "")
  );
}

function isVideoAttachment(attachment: ChatAttachment): boolean {
  return (
    attachment.mimeType?.startsWith("video/")
    || attachment.type === "video"
    || attachment.kind === "video"
    || /\.(m4v|mov|mp4|webm)$/i.test(attachment.fileName ?? "")
  );
}
