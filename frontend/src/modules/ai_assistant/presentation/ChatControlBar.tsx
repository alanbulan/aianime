// Copyright (c) 2026 AI anime
import { Braces, History, ListTree, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ModelEntry,
  RelayInstanceInfo,
  SuperChatSettings,
} from "@/modules/ai_assistant/domain/contracts";
import { cn } from "@/lib/utils";

export type ChatControlBarModel = {
  activeModel: string | null;
  busy: boolean;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  models: ModelEntry[];
  modelsLoading: boolean;
  relayInstances: RelayInstanceInfo[];
  selectedInstanceId: string;
  selectRelayInstance: (instanceId: string) => void;
  setSettings: (patch: Partial<SuperChatSettings>) => void;
  settings: SuperChatSettings;
  switchModel: (modelId: string) => void;
};

export function ControlBar({
  chat,
  compact = false,
}: {
  chat: ChatControlBarModel;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const hasInstances = chat.relayInstances.length > 0;
  const transportStatus =
    chat.connected
      ? "connected"
      : chat.connecting || chat.busy
        ? "reconnecting"
        : "disconnected";
  const transportLabel =
    transportStatus === "connected"
      ? t("aiAssistant.connected")
      : transportStatus === "reconnecting"
        ? t("aiAssistant.reconnecting")
        : t("aiAssistant.disconnected");
  return (
    <div
      className={cn(
        "flex min-w-0 shrink items-center gap-2",
        !compact && "flex-wrap border-b border-border/65 px-3 py-2",
      )}
    >
      {!compact && (
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" data-ui-tooltip={chat.error || transportLabel}>
          <span>{transportLabel}</span>
          <span>{t("aiAssistant.backendTransport")}</span>
        </div>
      )}
      {hasInstances && (
        <Select
          value={chat.selectedInstanceId}
          onValueChange={(value) => {
            if (value) chat.selectRelayInstance(value);
          }}
        >
          <SelectTrigger
            size="sm"
            className={cn("min-w-0 bg-background text-xs", compact ? "w-28" : "flex-1")}
            data-ui-tooltip={t("aiAssistant.instance")}
            aria-label={t("aiAssistant.instance")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {chat.relayInstances.map((instance) => (
              <SelectItem key={instance.instanceId} value={instance.instanceId}>
                {instance.instanceName || instance.instanceId}{instance.busy ? " *" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {!compact && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => chat.setSettings({
            showStructuredSourceWhileStreaming: !chat.settings.showStructuredSourceWhileStreaming,
          })}
          aria-pressed={chat.settings.showStructuredSourceWhileStreaming}
          aria-label={t("aiAssistant.showStructuredSourceWhileStreaming")}
          data-ui-tooltip={t("aiAssistant.showStructuredSourceWhileStreaming")}
          className={chat.settings.showStructuredSourceWhileStreaming ? "text-primary" : "text-muted-foreground"}
        >
          <Braces className="size-4" />
        </Button>
      )}
    </div>
  );
}

export function ChatPanelActions({
  chat,
  searchOpen,
  onToggleSessions,
  onToggleSearch,
}: {
  chat: ChatControlBarModel;
  searchOpen: boolean;
  onToggleSessions: () => void;
  onToggleSearch: () => void;
}) {
  const { t } = useTranslation();
  const toolEventsLabel = chat.settings.showToolEvents
    ? t("aiAssistant.hideToolEvents")
    : t("aiAssistant.showToolEvents");

  return (
    <div className="flex items-center gap-0.5 border-l border-border/70 pl-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground"
        onClick={onToggleSessions}
        aria-label={t("aiAssistant.expandSessions")}
        data-ui-tooltip={t("aiAssistant.expandSessions")}
      >
        <History className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "size-8",
          searchOpen ? "bg-muted text-primary" : "text-muted-foreground",
        )}
        onClick={onToggleSearch}
        aria-label={t("aiAssistant.search")}
        data-ui-tooltip={t("aiAssistant.search")}
      >
        <Search className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "size-8",
          chat.settings.showToolEvents
            ? "bg-muted text-primary"
            : "text-muted-foreground",
        )}
        onClick={() => {
          const showToolEvents = !chat.settings.showToolEvents;
          chat.setSettings({ showToolEvents });
          toast.success(
            t(
              showToolEvents
                ? "aiAssistant.toolEventsShown"
                : "aiAssistant.toolEventsHidden",
            ),
          );
        }}
        aria-pressed={chat.settings.showToolEvents}
        aria-label={toolEventsLabel}
        data-ui-tooltip={toolEventsLabel}
      >
        <ListTree className="size-4" />
      </Button>
    </div>
  );
}
