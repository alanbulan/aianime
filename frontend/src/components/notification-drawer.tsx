// Copyright (c) 2026 AI anime
import { OverlayPortal } from "@/components/ui/overlay";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Megaphone, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCommercialAnnouncements } from "@/modules/platform_release/public";

type NotificationTone = "update" | "notice";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time?: string;
  tone: NotificationTone;
}

const DRAWER_TRANSITION_MS = 260;

export function NotificationDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const commercialAnnouncements = useCommercialAnnouncements(
    Boolean(window.aiAnimeDesktop?.commercial),
  );
  const [shouldRender, setShouldRender] = useState(open);
  const [visible, setVisible] = useState(false);
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const notifications = (commercialAnnouncements.data?.items ?? []).map(
    (item) => ({
      id: `announcement:${item.id}`,
      tone: "notice" as const,
      title: item.title,
      body: item.body,
      time: formatReleaseTime(item.publishAt, locale),
    }),
  );
  const selectedNotification = notifications.find((item) => item.id === selectedNotificationId);
  const loading =
    notifications.length === 0 &&
    commercialAnnouncements.isLoading;
  const loadFailed =
    notifications.length === 0 &&
    Boolean(commercialAnnouncements.error);

  useEffect(() => {
    if (open) {
      setVisible(false);
      setShouldRender(true);
      let secondFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        if (secondFrame) window.cancelAnimationFrame(secondFrame);
      };
    }

    setVisible(false);
    setSelectedNotificationId(null);
    const timer = window.setTimeout(() => setShouldRender(false), DRAWER_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!shouldRender) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // The detail dialog owns Escape until it closes; keep the list open beneath it.
      if (event.key === "Escape" && !selectedNotification) onOpenChange(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, shouldRender, selectedNotification]);

  if (!shouldRender) return null;

  return <OverlayPortal kind="modal">
    <Dialog
      open={open && Boolean(selectedNotification)}
      onOpenChange={(detailOpen) => {
        if (!detailOpen) setSelectedNotificationId(null);
      }}
    >
    <div className="fixed inset-0 ">
      <button
        type="button"
        aria-label={t("notifications.close")}
        className={`absolute inset-0 bg-scrim transition-opacity duration-[260ms] ease-[var(--ease-out-quint)] ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => onOpenChange(false)}
      />
      <aside
        aria-label={t("notifications.title")}
        className={`absolute right-0 flex w-[390px] max-w-[calc(100vw-20px)] flex-col border-l border-border bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md transition-transform duration-[260ms] ease-[var(--ease-out-quint)] will-change-transform ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          top: "var(--desktop-title-bar-height, 0px)",
          height: "calc(100% - var(--desktop-title-bar-height, 0px))",
        }}
      >
        <header className="flex h-[54px] shrink-0 items-end justify-between px-5 pb-1.5">
          <h2 className="text-[20px] font-semibold tracking-normal text-foreground">
            {t("notifications.title")}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("notifications.close")}
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pb-3 pl-2 pr-4 pt-1">
          <div className="space-y-1">
            {notifications.length > 0 ? (
              notifications.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onSelect={(event) => {
                    detailTriggerRef.current = event.currentTarget;
                    setSelectedNotificationId(item.id);
                  }}
                />
              ))
            ) : loading ? (
              <div className="flex items-center gap-2 px-2 py-6 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                <span>{t("common.loading")}</span>
              </div>
            ) : (
              <p className="px-2 py-6 text-[13px] leading-5 text-muted-foreground">
                {t(loadFailed ? "notifications.loadFailed" : "notifications.empty")}
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
      {selectedNotification && (
        <DialogContent
          className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          style={{
            top: "calc(50% + var(--desktop-title-bar-height, 0px) / 2)",
            maxHeight: "calc(100dvh - var(--desktop-title-bar-height, 0px) - 2rem)",
          }}
          showCloseButton={false}
          finalFocus={detailTriggerRef}
        >
          <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-14">
            <DialogTitle className="whitespace-pre-wrap text-lg font-semibold leading-7 [overflow-wrap:anywhere]">
              {selectedNotification.title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("notifications.announcementBody")}
            </DialogDescription>
            {selectedNotification.time && (
              <p className="text-xs text-muted-foreground">{selectedNotification.time}</p>
            )}
          </DialogHeader>
          <div
            role="region"
            aria-label={t("notifications.announcementBody")}
            tabIndex={0}
            className="min-h-0 overflow-y-auto overscroll-contain whitespace-pre-wrap px-6 py-5 text-sm leading-7 [overflow-wrap:anywhere]"
          >
            {selectedNotification.body}
          </div>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-4 top-4"
                aria-label={t("notifications.closeAnnouncement")}
              />
            }
          >
            <X className="size-4" aria-hidden />
          </DialogClose>
        </DialogContent>
      )}
    </Dialog>
    </OverlayPortal>;
}

function NotificationRow({ item, onSelect }: {
  item: NotificationItem;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const Icon = item.tone === "update" ? Sparkles : Megaphone;

  return (
    <DialogTrigger
      type="button"
      aria-label={item.title}
      onClick={onSelect}
      className="group grid w-full grid-cols-[38px_minmax(0,1fr)] gap-3 rounded-[8px] px-2 py-3 text-left transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span className="flex size-[38px] items-center justify-center rounded-full border border-border bg-muted text-primary">
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium leading-5 text-foreground">
          {item.title}
        </span>
        <span className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
          {item.body}
        </span>
        {item.time ? (
          <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{item.time}</span>
        ) : null}
      </span>
    </DialogTrigger>
  );
}

function formatReleaseTime(value: string | null, locale: string): string | undefined {
  if (!value) return undefined;
  const published = new Date(value);
  if (Number.isNaN(published.getTime())) return undefined;
  const diffMs = published.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(locale.startsWith("zh") ? "zh" : "en", {
    numeric: "auto",
  });
  if (absMs < 60 * 60 * 1000) {
    return rtf.format(Math.round(diffMs / (60 * 1000)), "minute");
  }
  if (absMs < 24 * 60 * 60 * 1000) {
    return rtf.format(Math.round(diffMs / (60 * 60 * 1000)), "hour");
  }
  return rtf.format(Math.round(diffMs / (24 * 60 * 60 * 1000)), "day");
}
