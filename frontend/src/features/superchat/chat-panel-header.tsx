// Copyright (c) 2026 AI anime
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  ControlBar,
  HeaderControlPortal,
  type ChatControlBarModel,
} from "@/features/superchat/chat-control-bar";
import { cn } from "@/lib/utils";

export type ChatPanelHeaderProps = {
  chat: ChatControlBarModel;
  isFreezoneLayout: boolean;
  onRequestClose?: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
};

export function ChatPanelHeader({
  chat,
  isFreezoneLayout,
  onRequestClose,
  searchOpen,
  onToggleSearch,
}: ChatPanelHeaderProps) {
  const { t } = useTranslation();

  if (!isFreezoneLayout) {
    return (
      <HeaderControlPortal
        chat={chat}
        searchOpen={searchOpen}
        onToggleSearch={onToggleSearch}
      />
    );
  }

  return (
    <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-1">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="truncate text-sm font-medium text-foreground">
          {t("freezone.chat.title")}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className={cn(
              "size-1.5 rounded-full",
              chat.connected
                ? "bg-success"
                : chat.connecting
                  ? "bg-warning"
                  : "bg-muted-foreground",
            )}
            aria-hidden="true"
          />
          <span className="truncate">
            {chat.connected
              ? t("aiAssistant.connected")
              : chat.connecting || chat.busy
                ? t("aiAssistant.reconnecting")
                : t("aiAssistant.disconnected")}
          </span>
        </div>
      </div>
      <ControlBar
        chat={chat}
        compact
        searchOpen={searchOpen}
        onToggleSearch={onToggleSearch}
      />
      {onRequestClose && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRequestClose}
          aria-label={t("freezone.chat.close")}
          title={t("freezone.chat.close")}
          className="text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
