import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  ensureReleaseNotifications,
  markCurrentReleaseSeen,
  shouldAutoShowCurrentRelease,
  subscribeOpenVersionUpdateDialog,
  useCommercialRelease,
  useReleaseNotifications,
} from "@/modules/platform_release/composition";
import { normalizeReleaseLocale } from "@/modules/platform_release/domain/release-notifications";

const UPDATE_HERO_VIDEO_URL = "/video/login-community-preview.mp4";

export function VersionUpdateDialog() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const locale = normalizeReleaseLocale(
    i18n.resolvedLanguage ?? i18n.language,
  );
  const releaseNotifications = useReleaseNotifications(locale);
  const commercialEnabled = Boolean(window.aiAnimeDesktop?.commercial);
  const commercialRelease = useCommercialRelease(commercialEnabled);
  const refetchCommercialRelease = commercialRelease.refetch;
  const feed = releaseNotifications.data;
  const items = feed?.current_items ?? [];
  const commercialUpdateAvailable = Boolean(
    commercialRelease.data?.available && !commercialRelease.data.required,
  );
  const [open, setOpen] = useState(false);
  const autoOpenedTagRef = useRef<string | null>(null);
  const autoOpenedCommercialRef = useRef(false);

  useEffect(() => {
    const tag = feed?.current_tag ?? null;
    if (
      !tag ||
      autoOpenedTagRef.current === tag ||
      !shouldAutoShowCurrentRelease(feed)
    ) {
      return;
    }
    autoOpenedTagRef.current = tag;
    markCurrentReleaseSeen(tag);
    setOpen(true);
  }, [feed]);

  useEffect(() => {
    if (!commercialUpdateAvailable || autoOpenedCommercialRef.current) return;
    autoOpenedCommercialRef.current = true;
    setOpen(true);
  }, [commercialUpdateAvailable]);

  useEffect(
    () =>
      subscribeOpenVersionUpdateDialog(() => {
        const commercialCheck = commercialEnabled
          ? refetchCommercialRelease()
          : Promise.resolve();
        void Promise.all([
          ensureReleaseNotifications(queryClient, locale),
          commercialCheck,
        ]).finally(() => setOpen(true));
      }),
    [commercialEnabled, locale, queryClient, refetchCommercialRelease],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-scrim backdrop-blur-md supports-backdrop-filter:backdrop-blur-md"
        className="max-h-[min(84dvh,560px)] w-[min(calc(100vw-32px),360px)] gap-0 overflow-hidden rounded-[8px] border border-border bg-card p-0 text-card-foreground shadow-xl ring-0 sm:max-w-[360px]"
      >
        <div className="p-2">
          <div className="relative flex aspect-[2/1] overflow-hidden rounded-[12px] bg-muted">
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src={UPDATE_HERO_VIDEO_URL}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-media/[0.04]" />
          </div>
        </div>

        <div className="px-4.5 pb-5 pt-3.5 sm:px-5">
          <DialogTitle className="text-[17px] font-medium leading-tight tracking-normal text-foreground sm:text-[18px]">
            {t(
              commercialUpdateAvailable
                ? "app.commercialUpdate.availableTitle"
                : "app.versionUpdate.title",
            )}
          </DialogTitle>
          <div className="mt-4 max-h-[138px] space-y-4 overflow-y-auto pr-2 text-[12.5px] leading-6 text-muted-foreground [scrollbar-gutter:stable] sm:text-[13.5px]">
            {commercialUpdateAvailable ? (
              <p className="m-0">
                {t("app.commercialUpdate.availableDescription")}
              </p>
            ) : null}
            {items.length > 0 ? (
              items.map((item, index) => (
                <p key={item.id} className="m-0">
                  {index + 1}. {item.title}
                  {item.body ? `: ${item.body}` : ""}
                </p>
              ))
            ) : !commercialUpdateAvailable ? (
              <p className="m-0">{t("app.versionUpdate.empty")}</p>
            ) : null}
          </div>
          <Button
            type="button"
            className="mt-7 h-10 w-full rounded-[8px] bg-primary text-[14px] font-medium text-primary-foreground shadow-none hover:bg-primary/90"
            onClick={() => setOpen(false)}
          >
            {t(
              commercialUpdateAvailable
                ? "app.commercialUpdate.acknowledge"
                : "app.versionUpdate.confirm",
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
