import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  downloadCommercialUpdate,
  installCommercialUpdate,
  subscribeCommercialUpdateDownloadProgress,
  type CommercialUpdateDownloadProgress,
  useCommercialRelease,
} from "@/modules/platform_release/composition";
import { CommercialUpdateProgressView } from "@/modules/platform_release/presentation/CommercialUpdateProgress";

export function CommercialUpdateRequired({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const release = useCommercialRelease(enabled);
  const [installState, setInstallState] = useState<
    "idle" | "downloading" | "installing" | "error"
  >("idle");
  const [downloadProgress, setDownloadProgress] =
    useState<CommercialUpdateDownloadProgress | null>(null);
  const artifactId = release.data?.artifactId ?? null;
  const isInstalling =
    installState === "downloading" || installState === "installing";

  const handleInstall = useCallback(async () => {
    if (!artifactId || isInstalling) return;
    setDownloadProgress(null);
    setInstallState("downloading");
    try {
      await downloadCommercialUpdate(artifactId);
      setInstallState("installing");
      await installCommercialUpdate();
      setInstallState("idle");
      await release.refetch();
    } catch {
      setInstallState("error");
    }
  }, [artifactId, isInstalling, release]);

  useEffect(
    () => subscribeCommercialUpdateDownloadProgress(setDownloadProgress),
    [],
  );

  if (!release.data?.required) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-[8px] border border-border bg-card p-8 text-center text-card-foreground shadow-xl">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <RefreshCw className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-normal">
          {t("app.commercialUpdate.requiredTitle")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("app.commercialUpdate.requiredDescription")}
        </p>
        {release.isError || installState === "error" ? (
          <p className="mt-3 text-sm leading-6 text-destructive">
            {t(
              installState === "error"
                ? "app.commercialUpdate.installFailed"
                : "app.commercialUpdate.checkFailed",
            )}
          </p>
        ) : null}
        {artifactId !== null ? (
          <div className="mt-6 space-y-2">
            {installState === "downloading" ? (
              <CommercialUpdateProgressView progress={downloadProgress} />
            ) : null}
            <Button
              type="button"
              className="h-10 min-w-40 rounded-[8px]"
              disabled={isInstalling}
              onClick={() => void handleInstall()}
            >
              {isInstalling ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {isInstalling && installState === "downloading" && downloadProgress
                ? t("app.commercialUpdate.downloadingWithPercent", {
                    percent: Math.round(downloadProgress.percent),
                  })
                : t(
                    isInstalling
                      ? installState === "downloading"
                        ? "app.commercialUpdate.downloading"
                        : "app.commercialUpdate.installing"
                      : "app.commercialUpdate.downloadAndInstall",
                  )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9 min-w-28 text-[13px] text-muted-foreground"
              disabled={isInstalling || release.isFetching}
              onClick={() => void release.refetch()}
            >
              {release.isFetching ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t(
                release.isFetching
                  ? "app.commercialUpdate.checking"
                  : "app.commercialUpdate.recheck",
              )}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            className="mt-6 h-10 min-w-28 rounded-[8px]"
            disabled={release.isFetching}
            onClick={() => void release.refetch()}
          >
            {release.isFetching ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {t(
              release.isFetching
                ? "app.commercialUpdate.checking"
                : "app.commercialUpdate.recheck",
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
