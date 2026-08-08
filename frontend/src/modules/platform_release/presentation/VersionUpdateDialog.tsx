import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  downloadCommercialUpdate,
  installCommercialUpdate,
  subscribeOpenVersionUpdateDialog,
  useCommercialRelease,
} from "@/modules/platform_release/composition";

const UPDATE_HERO_VIDEO_URL = "/video/login-community-preview.mp4";

export function VersionUpdateDialog() {
  const { t } = useTranslation();
  const commercialEnabled = Boolean(window.aiAnimeDesktop?.commercial);
  const commercialRelease = useCommercialRelease(commercialEnabled);
  const refetchCommercialRelease = commercialRelease.refetch;
  const commercialUpdateAvailable = Boolean(
    commercialRelease.data?.available && !commercialRelease.data.required,
  );
  const [open, setOpen] = useState(false);
  const [installState, setInstallState] = useState<
    "idle" | "downloading" | "installing" | "error"
  >("idle");
  const autoOpenedCommercialRef = useRef(false);
  const artifactId = commercialRelease.data?.artifactId ?? null;
  const isInstalling =
    installState === "downloading" || installState === "installing";

  const handleInstall = useCallback(async () => {
    if (!artifactId || isInstalling) return;
    setInstallState("downloading");
    try {
      await downloadCommercialUpdate(artifactId);
      setInstallState("installing");
      await installCommercialUpdate();
      setInstallState("idle");
      setOpen(false);
    } catch {
      setInstallState("error");
    }
  }, [artifactId, isInstalling]);

  useEffect(() => {
    if (!commercialUpdateAvailable || autoOpenedCommercialRef.current) return;
    autoOpenedCommercialRef.current = true;
    setOpen(true);
  }, [commercialUpdateAvailable]);

  useEffect(
    () =>
      subscribeOpenVersionUpdateDialog(() => {
        if (commercialEnabled) {
          void refetchCommercialRelease().finally(() => setOpen(true));
        } else {
          setOpen(true);
        }
      }),
    [commercialEnabled, refetchCommercialRelease],
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
            ) : (
              <p className="m-0">{t("app.versionUpdate.empty")}</p>
            )}
          </div>
          {commercialUpdateAvailable && artifactId !== null ? (
            <div className="mt-7 space-y-2">
              {installState === "error" ? (
                <p className="text-center text-[12.5px] leading-5 text-destructive">
                  {t("app.commercialUpdate.installFailed")}
                </p>
              ) : null}
              <Button
                type="button"
                className="h-10 w-full rounded-[8px] bg-primary text-[14px] font-medium text-primary-foreground shadow-none hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isInstalling}
                onClick={() => void handleInstall()}
              >
                {isInstalling
                  ? t(
                      installState === "downloading"
                        ? "app.commercialUpdate.downloading"
                        : "app.commercialUpdate.installing",
                    )
                  : t("app.commercialUpdate.downloadAndInstall")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-full text-[13px] text-muted-foreground"
                disabled={isInstalling}
                onClick={() => setOpen(false)}
              >
                {t("app.commercialUpdate.acknowledge")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="mt-7 h-10 w-full rounded-[8px] bg-primary text-[14px] font-medium text-primary-foreground shadow-none hover:bg-primary/90"
              onClick={() => setOpen(false)}
            >
              {t("app.versionUpdate.confirm")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
