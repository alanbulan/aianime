// Copyright (c) 2026 AI anime
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
    <section className="border-t border-border px-5 py-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">
            {t("settings.update.title")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("settings.update.currentVersion", { version: APP_VERSION })}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={checking}
          onClick={() => void checkForUpdates()}
        >
          {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {t(checking ? "settings.update.checking" : "settings.update.check")}
        </Button>
      </div>
    </section>
  );
}
