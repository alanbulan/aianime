// Copyright (c) 2026 AI anime
import {
  Copy,
  File as FileIcon,
  Image,
  Maximize2,
  Pin,
  PinOff,
  Volume2,
  Wrench,
  X,
} from "lucide-react";
import { memo } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAiAvatarUrl } from "@/features/superchat/ai-avatar";
import {
  assistantCompletionTextEnd,
  errorTextRanges,
  isAssistantCompletionNotice,
  isAssistantErrorReply,
  isHistoricalToolMessage,
  isToolMessage,
  normalizeMessageText,
} from "@/features/superchat/message-presentation-rules";
import { UiSpecRenderer } from "@/features/superchat/spec-media-gallery";
import type { SpecMediaDetail } from "@/features/superchat/spec-media-modals";
import {
  extractStructuredBlocks,
  isUiSpec,
  looksLikeStructuredRenderText,
  type StructuredBlock,
} from "@/features/superchat/spec-extract";
import { JsonNode } from "@/features/superchat/structured-json-view";
import type {
  ChatAttachment,
  ChatMessage,
} from "@/features/superchat/types";
import { cn } from "@/lib/utils";

function PlainMessageText({ text }: { text: string }) {
  const paragraphs = normalizeMessageText(text)
    .split(/\n{2}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <div className="space-y-2 break-words leading-relaxed">
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
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        h1: ({ children }) => <h1 className="mb-2 mt-3 text-lg font-semibold leading-7 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-3 text-base font-semibold leading-6 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1.5 mt-2.5 text-sm font-semibold leading-6 first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
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
      }}
    >
      {normalized}
    </ReactMarkdown>
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
  role,
  label,
  streaming: _streaming = false,
}: {
  role: ChatMessage["role"];
  label?: string;
  streaming?: boolean;
}) {
  const isAssistant = role === "assistant";
  const isTool = role === "tool";
  const initial = label?.trim().charAt(0).toUpperCase() || (isAssistant ? "AI" : isTool ? "" : "U");
  // Shared, fetch-once avatar source (see ai-avatar.ts) - null until ready so we
  // don't kick off a raw-path request from every avatar before the blob lands.
  const avatarUrl = useAiAvatarUrl();

  return (
    <div
      className={cn(
        "relative flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border text-xs font-medium shadow-sm",
        isAssistant ? "size-11" : "size-10",
        isAssistant
          ? "border-transparent bg-transparent text-muted-foreground shadow-none"
          : isTool
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-primary/20 bg-primary text-primary-foreground",
      )}
      aria-hidden="true"
    >
      {isAssistant ? (
        avatarUrl && (
          <video
            className="size-full object-cover"
            src={avatarUrl}
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
          />
        )
      ) : isTool ? (
        <Wrench className="size-4" />
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
                onClick={() => navigator.clipboard?.writeText(JSON.stringify(block.value, null, 2)).catch(() => undefined)}
                aria-label="Copy JSON"
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
  const shouldWaitForStructuredRender =
    deferStructuredRender && !isUser && !isTool && looksLikeStructuredRenderText(message.text);
  const { displayText, blocks } = extractStructuredBlocks(message);
  const copyText = async () => {
    await navigator.clipboard?.writeText(message.text).catch(() => undefined);
  };
  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(message.text));
  };
  const userActionButtonClass =
    "size-7 rounded-md text-foreground/70 opacity-100 hover:bg-muted hover:text-foreground";
  const userActionIconClass = "size-3.5 stroke-[2.25]";
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
        aria-label="Copy"
      >
        <Copy className={cn("size-3.5", isUser && userActionIconClass)} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn("opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100", isUser && userActionButtonClass)}
        onClick={speak}
        aria-label="Speak"
      >
        <Volume2 className={cn("size-3.5", isUser && userActionIconClass)} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn("opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100", isUser && userActionButtonClass)}
        onClick={() => onOpenDetail(message)}
        aria-label="Details"
      >
        <Maximize2 className={cn("size-3.5", isUser && userActionIconClass)} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn("opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100", isUser && userActionButtonClass)}
        onClick={() => onTogglePin(message.id)}
        aria-label={pinned ? "Unpin" : "Pin"}
      >
        {pinned ? <PinOff className={cn("size-3.5", isUser && userActionIconClass)} /> : <Pin className={cn("size-3.5", isUser && userActionIconClass)} />}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn("opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100", isUser && userActionButtonClass)}
        onClick={() => onDelete(message.id)}
        aria-label="Delete"
      >
        <X className={cn("size-3.5", isUser && userActionIconClass)} />
      </Button>
    </div>
  );

  if (isUser) {
    return (
      <div className="flex justify-end">
        <article className={cn("max-w-[72%]", isFreezoneLayout && "max-w-[82%]")}>
          <div className="group/message-actions">
            <div
              className={cn(
                "relative rounded-[14px] border border-border bg-muted px-4 py-2.5 text-sm leading-6 text-foreground shadow-none",
              )}
            >
              {actions}
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
          role={message.role}
          label={message.displayName || t("aiAssistant.title")}
          streaming={streaming}
        />
      )}
      <div className={cn("flex min-w-0 flex-1", isUser ? "justify-end" : "justify-start")}>
        <article
          className={cn(
            "group relative text-sm leading-6 shadow-none",
            blocks.length > 0 && !isUser && !isTool
              ? "w-full min-w-0 overflow-visible"
              : "w-fit overflow-hidden",
            isTool
              ? "max-w-[86%] rounded-[14px] border border-warning/20 bg-warning/10 px-4 pb-3 pt-2 text-card-foreground"
              : isUser
                ? "max-w-[86%] rounded-[14px] bg-muted px-4 pb-3 pt-2 text-foreground"
                : "max-w-full rounded-[14px] border border-border bg-card px-4 pb-3 pt-2 text-foreground",
          )}
        >
        <div className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex translate-y-0.5 items-center gap-0.5 rounded-full border border-border/70 bg-background/85 px-1 py-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-70 hover:opacity-100"
            onClick={copyText}
            aria-label="Copy"
          >
            <Copy className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-70 hover:opacity-100"
            onClick={speak}
            aria-label="Speak"
          >
            <Volume2 className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-70 hover:opacity-100"
            onClick={() => onOpenDetail(message)}
            aria-label="Details"
          >
            <Maximize2 className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-70 hover:opacity-100"
            onClick={() => onTogglePin(message.id)}
            aria-label={pinned ? "Unpin" : "Pin"}
          >
            {pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-70 hover:opacity-100"
            onClick={() => onDelete(message.id)}
            aria-label="Delete"
          >
            <X className="size-3" />
          </Button>
        </div>
        {(isTool || (message.displayName && !isUser)) && (
          <div className="mb-1 flex items-center gap-2 pr-28">
            {isTool ? (
              <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] uppercase">
                {isHistoricalTool ? t("aiAssistant.historyTool") : t("aiAssistant.tool")}
              </Badge>
            ) : message.displayName && !isUser ? (
              <div className="text-[11px] font-medium text-muted-foreground">
                {message.displayName}
              </div>
            ) : null}
          </div>
        )}
        <AttachmentList attachments={message.attachments} />
        {shouldWaitForStructuredRender ? (
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
          role="user"
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
