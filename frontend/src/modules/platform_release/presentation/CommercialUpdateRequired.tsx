import { Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useCommercialRelease } from "@/modules/platform_release/composition";

export function CommercialUpdateRequired({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const release = useCommercialRelease(enabled);

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
        {release.isError ? (
          <p className="mt-3 text-sm leading-6 text-destructive">
            {t("app.commercialUpdate.checkFailed")}
          </p>
        ) : null}
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
      </div>
    </div>
  );
}
