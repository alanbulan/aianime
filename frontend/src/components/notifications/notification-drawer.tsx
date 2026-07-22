// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Megaphone, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReleaseNotifications } from "@/lib/queries/release-notifications";
import type { ReleaseItem } from "@/lib/queries/release-notifications";
import {
  markUpgradeSeen,
  markUpgradeSkipped,
} from "@/lib/release-notification-state";

type NotificationTone = "update" | "notice";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time?: string;
  tone: NotificationTone;
  actions?: React.ReactNode;
}

const DRAWER_TRANSITION_MS = 260;

export function NotificationDrawer({
  open,
  onOpenChange,
  onUpgradeStateChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgradeStateChange?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const releaseNotifications = useReleaseNotifications(locale);
  const feed = releaseNotifications.data?.data;
  const [shouldRender, setShouldRender] = useState(open);
  const [visible, setVisible] = useState(false);
  const notifications = buildNotifications({
    currentItems: feed?.current_items ?? [],
    latestItems: feed?.update_items ?? [],
    latestTag: feed?.latest_tag ?? null,
    updateAvailable: feed?.update_available ?? false,
    releaseUrl: feed?.release_url ?? null,
    publishedAt: feed?.latest_published_at ?? null,
    locale,
    t,
    onSkip: () => {
      markUpgradeSkipped(feed?.latest_tag);
      onUpgradeStateChange?.();
    },
    onOpenRelease: () => {
      markUpgradeSeen(feed?.latest_tag);
      onUpgradeStateChange?.();
    },
  });

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
    const timer = window.setTimeout(() => setShouldRender(false), DRAWER_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !feed?.update_available || !feed.latest_tag) return;
    markUpgradeSeen(feed.latest_tag);
    onUpgradeStateChange?.();
  }, [feed?.latest_tag, feed?.update_available, onUpgradeStateChange, open]);

  useEffect(() => {
    if (!shouldRender) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, shouldRender]);

  if (!shouldRender) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label={t("notifications.close")}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-[260ms] ease-[var(--ease-out-quint)] ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => onOpenChange(false)}
      />
      <aside
        aria-label={t("notifications.title")}
        className={`absolute right-0 flex w-[390px] max-w-[calc(100vw-20px)] flex-col border-l border-border bg-popover/95 text-popover-foreground shadow-[-24px_0_60px_rgba(0,0,0,0.24)] backdrop-blur-md transition-transform duration-[260ms] ease-[var(--ease-out-quint)] will-change-transform ${
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
              notifications.map((item) => <NotificationRow key={item.id} item={item} />)
            ) : (
              <p className="px-2 py-6 text-[13px] leading-5 text-muted-foreground">
                {t("notifications.empty")}
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const Icon = item.tone === "update" ? Sparkles : Megaphone;

  return (
    <article className="group grid grid-cols-[38px_minmax(0,1fr)] gap-3 rounded-[8px] px-2 py-3 transition-colors duration-150 hover:bg-muted">
      <div className="flex size-[38px] items-center justify-center rounded-full border border-border bg-muted text-primary">
        <Icon className="size-[18px]" />
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-[14px] font-medium leading-5 text-foreground">
          {item.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
          {item.body}
        </p>
        {item.time ? (
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.time}</p>
        ) : null}
        {item.actions ? <div className="mt-2 flex items-center gap-2">{item.actions}</div> : null}
      </div>
    </article>
  );
}

function buildNotifications({
  currentItems,
  latestItems,
  latestTag,
  updateAvailable,
  releaseUrl,
  publishedAt,
  locale,
  t,
  onSkip,
  onOpenRelease,
}: {
  currentItems: ReleaseItem[];
  latestItems: ReleaseItem[];
  latestTag: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  publishedAt: string | null;
  locale: string;
  t: (key: string, options?: Record<string, string>) => string;
  onSkip: () => void;
  onOpenRelease: () => void;
}): NotificationItem[] {
  const rows: NotificationItem[] = [];
  if (updateAvailable && latestTag) {
    rows.push({
      id: `release-upgrade:${latestTag}`,
      tone: "notice",
      title: t("notifications.upgrade.title", { version: latestTag }),
      body: t("notifications.upgrade.body"),
      time: formatReleaseTime(publishedAt, locale),
      actions: (
        <>
          {releaseUrl ? (
            <a
              className="rounded-[6px] border border-border px-2 py-1 text-[11px] font-medium leading-none text-primary transition-colors hover:bg-muted"
              href={releaseUrl}
              target="_blank"
              rel="noreferrer"
              onClick={onOpenRelease}
            >
              {t("notifications.upgrade.open")}
            </a>
          ) : null}
          <button
            type="button"
            className="rounded-[6px] px-2 py-1 text-[11px] font-medium leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onSkip}
          >
            {t("notifications.upgrade.skip")}
          </button>
        </>
      ),
    });
    for (const item of latestItems) {
      rows.push({
        id: item.id,
        tone: "notice",
        title: item.title,
        body: item.body,
      });
    }
  }

  for (const item of currentItems) {
    rows.push({
      id: item.id,
      tone: "update",
      title: item.title,
      body: item.body,
    });
  }
  return rows;
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
