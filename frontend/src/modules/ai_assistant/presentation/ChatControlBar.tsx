// Copyright (c) 2026 AI anime
import { Braces, ListTree, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
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
  searchOpen,
  onToggleSearch,
}: {
  chat: ChatControlBarModel;
  compact?: boolean;
  searchOpen: boolean;
  onToggleSearch: () => void;
}) {
  const { t } = useTranslation();
  const hasInstances = chat.relayInstances.length > 0;
  const hasModels = chat.models.length > 0;
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
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" title={chat.error || transportLabel}>
          <span>{transportLabel}</span>
          <span>{t("aiAssistant.backendTransport")}</span>
        </div>
      )}
      {hasInstances && (
        <select
          value={chat.selectedInstanceId}
          onChange={(event) => chat.selectRelayInstance(event.target.value)}
          className={cn(
            "h-7 min-w-0 rounded-md border border-border bg-background px-2 text-xs outline-none disabled:opacity-50",
            compact ? "w-28" : "flex-1",
          )}
          title={t("aiAssistant.instance")}
        >
          {chat.relayInstances.map((instance) => (
            <option key={instance.instanceId} value={instance.instanceId}>
              {instance.instanceName || instance.instanceId}{instance.busy ? " *" : ""}
            </option>
          ))}
        </select>
      )}
      {hasModels && (
        <select
          value={chat.activeModel ?? ""}
          onChange={(event) => chat.switchModel(event.target.value)}
          disabled={chat.modelsLoading}
          className={cn(
            "h-7 min-w-0 rounded-md border border-border bg-background px-2 text-xs outline-none disabled:opacity-50",
            compact ? "w-28" : "flex-1",
          )}
          title={t("aiAssistant.model")}
        >
          {chat.models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label || model.id}{model.reasoning ? " +" : ""}
            </option>
          ))}
        </select>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onToggleSearch}
        aria-label={t("aiAssistant.search")}
        title={t("aiAssistant.search")}
        className={searchOpen ? "text-primary" : "text-muted-foreground"}
      >
        <Search className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => chat.setSettings({ showToolEvents: !chat.settings.showToolEvents })}
        aria-pressed={chat.settings.showToolEvents}
        aria-label={t("aiAssistant.showToolEvents")}
        title={t("aiAssistant.showToolEvents")}
        className={chat.settings.showToolEvents ? "text-primary" : "text-muted-foreground"}
      >
        <ListTree className="size-4" />
      </Button>
      {!compact && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => chat.setSettings({
            showStructuredSourceWhileStreaming: !chat.settings.showStructuredSourceWhileStreaming,
          })}
          aria-pressed={chat.settings.showStructuredSourceWhileStreaming}
          aria-label={t("aiAssistant.showStructuredSourceWhileStreaming")}
          title={t("aiAssistant.showStructuredSourceWhileStreaming")}
          className={chat.settings.showStructuredSourceWhileStreaming ? "text-primary" : "text-muted-foreground"}
        >
          <Braces className="size-4" />
        </Button>
      )}
    </div>
  );
}

export function HeaderControlPortal({
  chat,
  searchOpen,
  onToggleSearch,
}: {
  chat: ChatControlBarModel;
  searchOpen: boolean;
  onToggleSearch: () => void;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("superchat-header-controls"));
  }, []);

  if (!target) return null;
  return createPortal(
    <ControlBar
      chat={chat}
      compact
      searchOpen={searchOpen}
      onToggleSearch={onToggleSearch}
    />,
    target,
  );
}
