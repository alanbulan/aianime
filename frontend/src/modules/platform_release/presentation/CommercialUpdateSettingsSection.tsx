// Copyright (c) 2026 AI anime
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand";
import { APP_VERSION } from "@/lib/app-version";
import {
  openVersionUpdateDialog,
  useCommercialRelease,
} from "@/modules/platform_release/composition";

export function CommercialUpdateSettingsSection({
  active,
  bridgeAvailable,
}: {
  active: boolean;
  bridgeAvailable: boolean;
}) {
  const { t } = useTranslation();
  const release = useCommercialRelease(active && bridgeAvailable);
  const [checking, setChecking] = useState(false);

  if (!bridgeAvailable) return null;

  const desktop = window.aiAnimeDesktop;
  const platformLabel = resolvePlatformLabel(desktop?.platform, t);
  const runtimeLabel = desktop?.versions?.electron
    ? `Electron ${desktop.versions.electron}`
    : t("settings.update.unknown");
  const updateStatus = release.isFetching
    ? t("settings.update.statusChecking")
    : release.data?.available
      ? t("settings.update.statusAvailable")
      : release.isSuccess
        ? t("settings.update.statusUpToDate")
        : t("settings.update.statusUnknown");

  const checkForUpdates = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const result = await release.refetch();
      if (result.error) throw result.error;
      if (result.data?.available) {
        openVersionUpdateDialog();
      } else {
        toast.success(t("settings.update.upToDate"));
      }
    } catch {
      toast.error(t("app.commercialUpdate.checkFailed"));
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="space-y-5 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <BrandMark className="size-7" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-medium text-foreground">
              {t("settings.update.productName")}
            </h3>
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
              {t("settings.update.description")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="default"
          variant="outline"
          className="min-w-28"
          disabled={checking}
          onClick={() => void checkForUpdates()}
        >
          {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {t(checking ? "settings.update.checking" : "settings.update.check")}
        </Button>
      </div>

      <dl className="grid gap-x-8 gap-y-5 border-y border-border py-5 sm:grid-cols-2">
        <ApplicationDetail
          label={t("settings.update.applicationName")}
          value="AI anime"
        />
        <ApplicationDetail
          label={t("settings.update.currentVersionLabel")}
          value={APP_VERSION}
        />
        <ApplicationDetail
          label={t("settings.update.platform")}
          value={platformLabel}
        />
        <ApplicationDetail
          label={t("settings.update.runtime")}
          value={runtimeLabel}
        />
        <ApplicationDetail
          label={t("settings.update.releaseChannel")}
          value={t("settings.update.releaseChannelStable")}
        />
        <ApplicationDetail
          label={t("settings.update.updateStatus")}
          value={updateStatus}
        />
        <ApplicationDetail
          wide
          label={t("settings.update.updatePolicy")}
          value={t("settings.update.updatePolicyValue")}
        />
      </dl>
    </section>
  );
}

function ApplicationDetail({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "min-w-0 sm:col-span-2" : "min-w-0"}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

function resolvePlatformLabel(
  platform: string | undefined,
  t: (key: string) => string,
): string {
  if (platform === "win32") return t("settings.update.platformWindows");
  if (platform === "darwin") return t("settings.update.platformMacos");
  if (platform === "linux") return t("settings.update.platformLinux");
  return platform || t("settings.update.unknown");
}
