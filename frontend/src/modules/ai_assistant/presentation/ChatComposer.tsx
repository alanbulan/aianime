// Copyright (c) 2026 AI anime
import {
  ArrowUp,
  File as FileIcon,
  Image,
  Mic,
  MicOff,
  Plus,
  X,
} from "lucide-react";
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
} from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatAttachment } from "@/modules/ai_assistant/domain/contracts";
import { ComposerWaitingStatus } from "@/modules/ai_assistant/presentation/ComposerWaitingStatus";
import { QueuedMessagesPanel } from "@/modules/ai_assistant/presentation/QueuedMessagesPanel";
import { cn } from "@/lib/utils";

type QueuedMessageItem = {
  id: string;
  text: string;
  attachments: ChatAttachment[];
};

export type ChatComposerProps = {
  attachments: ChatAttachment[];
  busy: boolean;
  canSend: boolean;
  connected: boolean;
  draft: string;
  draftInputRef: RefObject<HTMLTextAreaElement | null>;
  dragFileState: "valid" | "invalid" | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  fileUploadEnabled: boolean;
  isFreezoneLayout: boolean;
  queuedMessages: QueuedMessageItem[];
  recording: boolean;
  transcribing: boolean;
  selectedHistoryMessageIndex: number | null;
  selectedQueuedMessageId: string | null;
  shellRef: RefObject<HTMLDivElement | null>;
  showWaitingIndicator: boolean;
  onAbort: () => void;
  onAddFiles: (files: FileList) => void;
  onAttachmentRemove: (attachmentId: string | undefined) => void;
  onDragEnter: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDraftChange: (draft: string) => void;
  onDraftFocusChange: (focused: boolean) => void;
  onDropFiles: (event: ReactDragEvent<HTMLDivElement>) => boolean;
  onHistorySelect: (direction: "older" | "newer") => boolean;
  onOpenFilePicker: () => void;
  onQueueOffset: (offset: number) => void;
  onQueueRemove: (messageId: string) => void;
  onQueueSelect: (messageId: string) => void;
  onResetHistorySelection: () => void;
  onSubmit: () => void;
  onToggleSpeech: () => void;
};

export function ChatComposer({
  attachments,
  busy,
  canSend,
  connected,
  draft,
  draftInputRef,
  dragFileState,
  fileInputRef,
  fileUploadEnabled,
  isFreezoneLayout,
  queuedMessages,
  recording,
  transcribing,
  selectedHistoryMessageIndex,
  selectedQueuedMessageId,
  shellRef,
  showWaitingIndicator,
  onAbort,
  onAddFiles,
  onAttachmentRemove,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDraftChange,
  onDraftFocusChange,
  onDropFiles,
  onHistorySelect,
  onOpenFilePicker,
  onQueueOffset,
  onQueueRemove,
  onQueueSelect,
  onResetHistorySelection,
  onSubmit,
  onToggleSpeech,
}: ChatComposerProps) {
  const { t } = useTranslation();

  const restoreDraftFocus = () => {
    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus({ preventScroll: true });
    });
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (
      target
      && target !== draftInputRef.current
      && (
        target.tagName === "BUTTON"
        || target.tagName === "INPUT"
        || target.getAttribute("role") === "button"
      )
    ) {
      return;
    }
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className={cn(
      "sticky bottom-0 z-40 shrink-0 bg-transparent p-3",
      isFreezoneLayout && "px-4 pb-4 pt-1",
    )}>
      <div className={cn(
        "relative mx-auto mb-2.5 h-7 w-full max-w-[760px]",
        isFreezoneLayout && "max-w-none",
      )}>
        <ComposerWaitingStatus
          label={t("aiAssistant.waitingResponse")}
          visible={showWaitingIndicator}
        />
      </div>
      <div
        ref={shellRef}
        data-composer-shell=""
        className={cn(
          "relative mx-auto w-full max-w-[760px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
          dragFileState === "valid" && "border-primary/70 bg-primary/5",
          dragFileState === "invalid" && "border-destructive/80 bg-destructive/10",
          isFreezoneLayout && "max-w-none rounded-xl bg-card",
        )}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(event) => {
          if (onDropFiles(event)) restoreDraftFocus();
        }}
        onKeyDown={handleComposerKeyDown}
      >
        {fileUploadEnabled && (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".txt,.md,.doc,.docx"
            onChange={(event) => {
              const files = event.target.files;
              if (!files) return;
              onAddFiles(files);
              restoreDraftFocus();
            }}
          />
        )}
        {fileUploadEnabled && dragFileState && (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/72 text-sm font-medium backdrop-blur-sm",
              dragFileState === "invalid" ? "text-destructive" : "text-foreground",
            )}
          >
            {dragFileState === "invalid"
              ? t("aiAssistant.unsupportedDropFiles")
              : t("aiAssistant.dropFiles")}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex max-w-48 items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs"
              >
                {attachment.mimeType?.startsWith("image/")
                  ? <Image className="size-3.5" />
                  : <FileIcon className="size-3.5" />}
                <span className="truncate">{attachment.fileName}</span>
                <button
                  type="button"
                  onClick={() => onAttachmentRemove(attachment.id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t("aiAssistant.removeAttachment")}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <QueuedMessagesPanel
          messages={queuedMessages}
          selectedMessageId={selectedQueuedMessageId}
          onRemove={onQueueRemove}
          onSelect={onQueueSelect}
        />
        <Textarea
          ref={draftInputRef}
          value={draft}
          onChange={(event) => {
            onResetHistorySelection();
            onDraftChange(event.target.value);
          }}
          onFocus={() => onDraftFocusChange(true)}
          onBlur={() => onDraftFocusChange(false)}
          onKeyDown={(event) => {
            if (
              queuedMessages.length > 0
              && draft.trim().length === 0
              && (event.key === "ArrowUp" || event.key === "ArrowDown")
            ) {
              event.preventDefault();
              onQueueOffset(event.key === "ArrowUp" ? -1 : 1);
              return;
            }
            if (
              event.key === "ArrowUp"
              && queuedMessages.length === 0
              && (draft.trim().length === 0 || selectedHistoryMessageIndex !== null)
            ) {
              event.preventDefault();
              onHistorySelect("older");
              return;
            }
            if (
              event.key === "ArrowDown"
              && queuedMessages.length === 0
              && selectedHistoryMessageIndex !== null
            ) {
              event.preventDefault();
              onHistorySelect("newer");
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          dir="auto"
          placeholder={t("aiAssistant.placeholder")}
          className={cn(
            "max-h-[220px] min-h-14 resize-none border-0 bg-transparent px-5 py-4 text-base shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 dark:bg-transparent",
            isFreezoneLayout && "min-h-11 px-3.5 py-3 text-sm",
          )}
          rows={1}
        />
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1">
            {fileUploadEnabled && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={!connected}
                onClick={onOpenFilePicker}
                aria-label={t("aiAssistant.attach")}
                title={t("aiAssistant.attach")}
              >
                <Plus className="size-4" />
              </Button>
            )}
          </div>
          <div className="flex shrink-0 items-end gap-1.5">
            {(recording || transcribing) && (
              <div className="mr-1 flex items-center gap-1.5 text-sm text-primary">
                <span className="size-2 animate-pulse rounded-full bg-primary" />
                <span>
                  {t(
                    transcribing
                      ? "aiAssistant.transcribing"
                      : "aiAssistant.listening",
                  )}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
                recording && "text-primary",
              )}
              disabled={!connected || transcribing}
              onClick={onToggleSpeech}
              aria-label={recording
                ? t("aiAssistant.stopVoice")
                : t("aiAssistant.voiceInput")}
              title={recording
                ? t("aiAssistant.stopVoice")
                : t("aiAssistant.voiceInput")}
            >
              {recording
                ? <MicOff className="size-4.5" />
                : <Mic className="size-4.5" />}
            </Button>
            <Button
              type="button"
              size="icon"
              className={cn(
                "size-8 rounded-full shadow-none disabled:bg-muted disabled:text-muted-foreground/45",
                busy
                  ? "bg-muted text-foreground hover:bg-accent"
                  : "bg-foreground text-background hover:bg-foreground/90",
              )}
              disabled={busy ? false : !canSend}
              onClick={busy ? onAbort : onSubmit}
              aria-label={busy ? t("aiAssistant.stop") : t("aiAssistant.send")}
              title={busy ? t("aiAssistant.stop") : t("aiAssistant.send")}
            >
              {busy ? (
                <span className="size-2.5 rounded-[2.5px] bg-current" aria-hidden />
              ) : (
                <ArrowUp className="size-[18px]" />
              )}
            </Button>
          </div>
        </div>
      </div>
      {!isFreezoneLayout && (
        <p className="mx-auto mt-[13px] w-full max-w-[680px] text-center text-[11px] leading-4 text-muted-foreground/80">
          {t("aiAssistant.disclaimer")}
        </p>
      )}
    </div>
  );
}
