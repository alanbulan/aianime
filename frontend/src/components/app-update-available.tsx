// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  dismissUpdateAvailable,
  useUpdateAvailable,
} from "@/lib/app-update-available";

export function AppUpdateAvailable() {
  const { t } = useTranslation();
  const visible = useUpdateAvailable();

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-12 z-[1000] flex justify-center px-4">
      <div className="pointer-events-auto flex h-[54px] w-fit max-w-[calc(100vw-32px)] items-center gap-[22px] rounded-[8px] border border-border bg-popover/95 px-[11px] text-popover-foreground shadow-xl backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-[7px]">
          <RefreshCw className="size-[13px] shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="min-w-0 max-w-[151px] truncate text-[12px] font-semibold text-foreground">
            {t("app.updateAvailable.title")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-[7px]">
          <Button
            type="button"
            className="h-[31px] min-w-[68px] rounded-[8px] bg-primary px-[11px] text-[12px] font-medium text-primary-foreground shadow-none hover:bg-primary/90 active:bg-primary/80"
            onClick={() => window.location.reload()}
          >
            {t("app.updateAvailable.refresh")}
          </Button>
          <button
            type="button"
            aria-label={t("app.updateAvailable.dismiss")}
            onClick={dismissUpdateAvailable}
            className="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
