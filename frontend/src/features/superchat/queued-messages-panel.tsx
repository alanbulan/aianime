// Copyright (c) 2026 AI anime
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ChatAttachment } from "@/features/superchat/types";
import { cn } from "@/lib/utils";

type QueuedMessageItem = {
  id: string;
  text: string;
  attachments: ChatAttachment[];
};

export function QueuedMessagesPanel({
  messages,
  selectedMessageId,
  onRemove,
  onSelect,
}: {
  messages: QueuedMessageItem[];
  selectedMessageId: string | null;
  onRemove: (messageId: string) => void;
  onSelect: (messageId: string) => void;
}) {
  const { t } = useTranslation();
  if (messages.length === 0) return null;

  return (
    <div className="border-t border-border px-4 py-2">
      <div className="mb-1.5 text-xs font-normal text-muted-foreground">
        {t("aiAssistant.queuedCount", { count: messages.length })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {messages.map((message) => {
          const showSelectedState =
            messages.length > 1 && selectedMessageId === message.id;
          return (
            <div
              key={message.id}
              className={cn(
                "inline-flex max-w-full items-center overflow-hidden rounded-[6px] border border-border bg-muted text-xs text-foreground/70 transition-colors hover:bg-accent focus-within:border-primary/45",
                showSelectedState
                && "border-primary/35 bg-primary/[0.07] text-foreground/90 focus-within:border-primary/45",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(message.id)}
                className="flex min-w-0 items-center gap-1.5 px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
                aria-label={t("aiAssistant.selectQueuedMessage")}
                aria-pressed={showSelectedState}
              >
                <span className="max-w-56 truncate">{message.text}</span>
                {message.attachments.length > 0 && (
                  <span className="shrink-0 text-muted-foreground">
                    {t("aiAssistant.queuedAttachments", {
                      count: message.attachments.length,
                    })}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onRemove(message.id)}
                className="mr-0.5 flex size-5 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={t("aiAssistant.removeQueuedMessage")}
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
