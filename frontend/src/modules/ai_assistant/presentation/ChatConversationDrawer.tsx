// Copyright (c) 2026 AI anime
import { MessageSquareText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ChatConversation } from "@/modules/ai_assistant/domain/contracts";
import { cn } from "@/lib/utils";

export type ChatConversationDrawerProps = {
  activeConversationId: string;
  conversations: ChatConversation[];
  disabled?: boolean;
  open: boolean;
  onCreate: () => void;
  onDelete: (conversationId: string) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (conversationId: string) => void;
};

function conversationTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export function ChatConversationDrawer({
  activeConversationId,
  conversations,
  disabled = false,
  open,
  onCreate,
  onDelete,
  onOpenChange,
  onSelect,
}: ChatConversationDrawerProps) {
  const { t } = useTranslation();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[min(22rem,88vw)] gap-0 border-border/80 bg-card p-0 sm:max-w-[22rem]"
        style={{
          top: "var(--desktop-title-bar-height, 0px)",
          bottom: "auto",
          height: "calc(100dvh - var(--desktop-title-bar-height, 0px))",
        }}
      >
        <SheetHeader className="border-b border-border/70 px-4 py-4 pr-12">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle>{t("aiAssistant.chatTitle")}</SheetTitle>
              <SheetDescription>
                {t("aiAssistant.sessionHistoryDescription")}
              </SheetDescription>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={onCreate}
              disabled={disabled}
              className="shrink-0 gap-1.5"
            >
              <Plus className="size-4" />
              {t("aiAssistant.newChat")}
            </Button>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {conversations.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center text-muted-foreground">
              <MessageSquareText className="size-6" />
              <span className="text-sm">{t("aiAssistant.noSessions")}</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {conversations.map((conversation) => {
                const active = conversation.id === activeConversationId;
                return (
                  <div
                    key={conversation.id}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                      active
                        ? "border-primary/50 bg-primary/8 text-foreground"
                        : "border-transparent text-foreground hover:border-border hover:bg-muted/65",
                      disabled && !active && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      disabled={disabled && !active}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                          active ? "bg-primary text-primary-foreground" : "bg-muted",
                        )}
                      >
                        <MessageSquareText className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {conversation.title || t("aiAssistant.newChat")}
                        </span>
                        <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span>
                            {t("aiAssistant.sessionMessageCount", {
                              count: conversation.messageCount,
                            })}
                          </span>
                          <span>{conversationTimestamp(conversation.updatedAt)}</span>
                        </span>
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={disabled}
                      onClick={() => setPendingDeleteId(conversation.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={t("aiAssistant.deleteConversation")}
                      data-ui-tooltip={t("aiAssistant.deleteConversation")}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
      <AlertDialog
        open={Boolean(pendingDeleteId)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("aiAssistant.deleteConversationTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("aiAssistant.deleteConversationDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDeleteId) onDelete(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              {t("aiAssistant.deleteConversation")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
