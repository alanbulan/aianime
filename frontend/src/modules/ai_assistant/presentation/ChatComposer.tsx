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
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  ReactNode,
} from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Command } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import type {
  ChatAttachment,
  ChatSlashCommandResult,
  ChatSlashCommand,
  ModelEntry,
  StructuredSlashCommandName,
} from "@/modules/ai_assistant/domain/contracts";
import {
  filterSlashCommands,
  slashCommandAction,
  slashCommandQuery,
} from "@/modules/ai_assistant/domain/slashCommand";
import { ComposerWaitingStatus } from "@/modules/ai_assistant/presentation/ComposerWaitingStatus";
import { ComposerContextMenu } from "@/modules/ai_assistant/presentation/ComposerContextMenu";
import { ComposerModelMenu } from "@/modules/ai_assistant/presentation/ComposerModelMenu";
import { QueuedMessagesPanel } from "@/modules/ai_assistant/presentation/QueuedMessagesPanel";
import {
  SlashCommandMenu,
  type SlashMenuMode,
} from "@/modules/ai_assistant/presentation/SlashCommandMenu";
import { cn } from "@/lib/utils";

type QueuedMessageItem = {
  id: string;
  text: string;
  attachments: ChatAttachment[];
};

type ModelPickerOrigin = "composer" | "slash" | null;
type SlashRoute = "help" | "tools" | "skill" | null;
type SlashRouteParent = "commands" | "help";

export type ChatComposerProps = {
  activeModel: string | null;
  activeReasoningEffort: string | null;
  attachments: ChatAttachment[];
  assistantActions?: ReactNode;
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
  models: ModelEntry[];
  modelsLoading: boolean;
  slashCommands: ChatSlashCommand[];
  recording: boolean;
  transcribing: boolean;
  selectedHistoryMessageIndex: number | null;
  selectedQueuedMessageId: string | null;
  shellRef: RefObject<HTMLDivElement | null>;
  showWaitingIndicator: boolean;
  onAbort: () => void;
  onAddFiles: (files: FileList | readonly File[]) => void;
  onAttachmentRemove: (attachmentId: string | undefined) => void;
  onDragEnter: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDraftChange: (draft: string) => void;
  onDraftFocusChange: (focused: boolean) => void;
  onDropFiles: (event: ReactDragEvent<HTMLDivElement>) => boolean;
  onRunSlashCommand: (
    command: StructuredSlashCommandName,
  ) => Promise<ChatSlashCommandResult>;
  onHistorySelect: (direction: "older" | "newer") => boolean;
  onOpenFilePicker: () => void;
  onQueueOffset: (offset: number) => void;
  onQueueRemove: (messageId: string) => void;
  onQueueSelect: (messageId: string) => void;
  onRefreshModels: () => void;
  onResetHistorySelection: () => void;
  onSubmit: () => void;
  onSwitchModel: (modelId: string) => boolean;
  onSwitchReasoningEffort: (reasoningEffort: string) => boolean;
  onToggleSpeech: () => void;
};

export function ChatComposer({
  attachments,
  activeModel,
  activeReasoningEffort,
  assistantActions,
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
  models,
  modelsLoading,
  slashCommands,
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
  onRunSlashCommand,
  onHistorySelect,
  onOpenFilePicker,
  onQueueOffset,
  onQueueRemove,
  onQueueSelect,
  onRefreshModels,
  onResetHistorySelection,
  onSubmit,
  onSwitchModel,
  onSwitchReasoningEffort,
  onToggleSpeech,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const slashListboxId = useId();
  const [selectedSlashValue, setSelectedSlashValue] = useState("");
  const [modelPickerOrigin, setModelPickerOrigin] = useState<ModelPickerOrigin>(null);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [slashRoute, setSlashRoute] = useState<SlashRoute>(null);
  const [slashRouteParent, setSlashRouteParent] = useState<SlashRouteParent>("commands");
  const [selectedCommand, setSelectedCommand] = useState<ChatSlashCommand | null>(null);
  const [dismissedSlashDraft, setDismissedSlashDraft] = useState<string | null>(null);
  const [paletteQuery, setPaletteQuery] = useState("");
  const slashModelPickerOpen = modelPickerOrigin === "slash";
  const composerModelMenuOpen = modelPickerOrigin === "composer";
  const slashQuery = slashCommandQuery(draft);
  const filteredSlashCommands = useMemo(
    () => slashQuery === null
      ? []
      : filterSlashCommands(slashCommands, slashQuery),
    [slashCommands, slashQuery],
  );
  const slashMenuOpen = slashQuery !== null && dismissedSlashDraft !== draft;
  const tools = useMemo(
    () => slashCommands.find((command) => (
      command.kind !== "skill" && command.name === "tools"
    ))?.tools ?? [],
    [slashCommands],
  );
  const routeOpen = slashRoute !== null;
  const paletteOpen = slashMenuOpen || slashModelPickerOpen || routeOpen;
  const paletteMode: SlashMenuMode = slashModelPickerOpen
    ? "models"
    : slashRoute ?? "commands";
  const firstSlashValue = filteredSlashCommands[0]
    ? `${filteredSlashCommands[0].kind ?? "command"}:${filteredSlashCommands[0].name}`
    : "";
  useEffect(() => {
    setPaletteQuery("");
    if (paletteMode === "tools") {
      const firstVisibleTool = tools.find((tool) => tool.category === "确认与决策")
        ?? tools[0];
      setSelectedSlashValue(firstVisibleTool ? `tool:${firstVisibleTool.name}` : "");
      return;
    }
    if (paletteMode === "models") {
      const selectedModel = models.find((model) => (
        model.id === (activeModel ?? "auto")
      ));
      setSelectedSlashValue(`model:${selectedModel?.id ?? models[0]?.id ?? "auto"}`);
      return;
    }
    if (paletteMode === "help") {
      const first = slashCommands[0];
      setSelectedSlashValue(first ? `${first.kind ?? "command"}:${first.name}` : "");
      return;
    }
    setSelectedSlashValue(paletteMode === "commands" ? firstSlashValue : "");
  }, [activeModel, firstSlashValue, models, paletteMode, slashCommands, tools]);

  const restoreDraftFocus = () => {
    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus({ preventScroll: true });
    });
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.defaultPrevented) return;
    if (paletteOpen) return;
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

  const handlePaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    if (!fileUploadEnabled) return;
    const images = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (images.length === 0) return;
    event.preventDefault();
    onAddFiles(images);
  };

  const resetSlashRoute = () => {
    setSlashRoute(null);
    setSelectedCommand(null);
  };

  const selectSlashCommand = (command: ChatSlashCommand) => {
    const action = slashCommandAction(command);
    const parent = slashRoute === "help" ? "help" : "commands";
    setSlashRouteParent(parent);
    setDismissedSlashDraft(null);
    setModelPickerOrigin(null);
    setContextMenuOpen(false);
    setSelectedCommand(null);
    onResetHistorySelection();
    onDraftChange("");
    if (action === "help-picker") {
      setSlashRoute("help");
      return;
    }
    if (action === "model-picker") {
      setModelPickerOrigin("slash");
      setSlashRoute(null);
      onRefreshModels();
      return;
    }
    if (action === "tool-picker") {
      setSlashRoute("tools");
      return;
    }
    setSelectedCommand(command);
    setSlashRoute("skill");
  };

  const selectModel = (modelId: string) => {
    if (busy || modelsLoading || !onSwitchModel(modelId)) return;
    setModelPickerOrigin(null);
    resetSlashRoute();
    setSelectedSlashValue("");
    restoreDraftFocus();
  };

  const setComposerModelMenuOpen = (open: boolean) => {
    setContextMenuOpen(false);
    setModelPickerOrigin(open ? "composer" : null);
    resetSlashRoute();
    if (!open) return;
    setDismissedSlashDraft(draft);
    onResetHistorySelection();
    onRefreshModels();
  };

  const setComposerContextMenuOpen = (open: boolean) => {
    setModelPickerOrigin(null);
    resetSlashRoute();
    setContextMenuOpen(open);
    if (open) {
      setDismissedSlashDraft(draft);
      onResetHistorySelection();
    }
  };

  const closeSlashPicker = () => {
    if (paletteMode !== "help" && slashRouteParent === "help") {
      setModelPickerOrigin(null);
      setSlashRoute("help");
      setSelectedCommand(null);
      return;
    }
    setModelPickerOrigin(null);
    resetSlashRoute();
    onDraftChange("/");
    restoreDraftFocus();
  };

  const useSelectedSkill = () => {
    if (!selectedCommand) return;
    const nextDraft = `/${selectedCommand.name} `;
    setModelPickerOrigin(null);
    resetSlashRoute();
    onDraftChange(nextDraft);
    restoreDraftFocus();
  };

  return (
    <div className={cn(
      "sticky bottom-0 z-40 shrink-0 bg-transparent p-3",
      isFreezoneLayout && "px-4 pb-4 pt-1",
    )}>
      <Command
        className="contents"
        label={paletteMode === "models"
          ? "搜索模型"
          : paletteMode === "tools"
            ? "搜索可用工具"
            : paletteMode === "help"
              ? "搜索命令或 Skill"
              : t("aiAssistant.slashCommands", "Slash 命令与 Skills")}
        loop
        shouldFilter={paletteMode === "models" || paletteMode === "tools" || paletteMode === "help"}
        value={selectedSlashValue}
        onValueChange={setSelectedSlashValue}
      >
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
        className={cn(
          "mx-auto w-full max-w-[760px]",
          isFreezoneLayout && "max-w-none",
        )}
      >
        {paletteOpen && (
          <SlashCommandMenu
            activeModel={activeModel}
            commands={paletteMode === "commands" ? filteredSlashCommands : slashCommands}
            disabled={busy}
            isFreezoneLayout={isFreezoneLayout}
            listboxId={slashListboxId}
            mode={paletteMode}
            models={models}
            modelsLoading={modelsLoading}
            query={paletteQuery}
            selectedCommand={selectedCommand}
            tools={tools}
            onBack={closeSlashPicker}
            onQueryChange={setPaletteQuery}
            onSelectCommand={selectSlashCommand}
            onSelectModel={selectModel}
            onUseSkill={useSelectedSkill}
          />
        )}
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
            accept=".txt,.md,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif"
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
            setModelPickerOrigin(null);
            setContextMenuOpen(false);
            resetSlashRoute();
            setDismissedSlashDraft(null);
            onResetHistorySelection();
            onDraftChange(event.target.value);
          }}
          onFocus={() => {
            setDismissedSlashDraft(null);
            onDraftFocusChange(true);
          }}
          onBlur={() => onDraftFocusChange(false)}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (slashMenuOpen) {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setDismissedSlashDraft(draft);
                return;
              }
              if (
                filteredSlashCommands.length > 0
                && event.key === "Tab"
              ) {
                event.preventDefault();
                event.stopPropagation();
                const command = filteredSlashCommands.find((item) => (
                  `${item.kind ?? "command"}:${item.name}` === selectedSlashValue
                )) ?? filteredSlashCommands[0];
                if (command) selectSlashCommand(command);
                return;
              }
              if (
                event.key === "Enter"
                || event.key === "ArrowDown"
                || event.key === "ArrowUp"
                || event.key === "Home"
                || event.key === "End"
              ) return;
            }
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
          aria-autocomplete="list"
          aria-expanded={paletteOpen}
          aria-controls={paletteOpen ? slashListboxId : undefined}
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
                data-ui-tooltip={t("aiAssistant.attach")}
              >
                <Plus className="size-4" />
              </Button>
            )}
            {assistantActions}
          </div>
          <div className="flex min-w-0 items-end gap-1.5">
            {(recording || transcribing) && (
              <div className="mr-1 flex items-center gap-1.5 text-sm text-primary">
                <span className="size-2 animate-pulse rounded-full bg-primary" />
                 <span>
                  {transcribing
                    ? t("aiAssistant.transcribing")
                    : t("aiAssistant.listening")}
                 </span>
              </div>
            )}
            <ComposerContextMenu
              busy={busy}
              connected={connected}
              open={contextMenuOpen}
              onOpenChange={setComposerContextMenuOpen}
              onRunCommand={onRunSlashCommand}
            />
            <ComposerModelMenu
              activeModel={activeModel}
              activeReasoningEffort={activeReasoningEffort}
              busy={busy}
              connected={connected}
              models={models}
              modelsLoading={modelsLoading}
              open={composerModelMenuOpen}
              onOpenChange={setComposerModelMenuOpen}
              onSelectModel={selectModel}
              onSelectReasoningEffort={(effort) => {
                if (onSwitchReasoningEffort(effort)) {
                  setModelPickerOrigin(null);
                  restoreDraftFocus();
                }
              }}
            />
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
              data-ui-tooltip={recording
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
              data-ui-tooltip={busy ? t("aiAssistant.stop") : t("aiAssistant.send")}
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
      </Command>
    </div>
  );
}
