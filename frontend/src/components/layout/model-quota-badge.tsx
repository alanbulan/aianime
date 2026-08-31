// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";

import { QUOTA_VALUE_CLASS, QuotaSparkIcon } from "@/components/quota-visual";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useCommercialAuthStore,
  useCommercialEntitlementStore,
} from "@/modules/identity_access/public";
import { useCommercialQuota } from "@/modules/model_usage/public";
import { cn } from "@/lib/utils";

function formatQuotaUnits(value: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);
}

export function ModelQuotaBadge() {
  const { t, i18n } = useTranslation();
  const commercialAvailability = useCommercialAuthStore((s) => s.availability);
  const commercialSession = useCommercialAuthStore((s) => s.session);
  const entitlement = useCommercialEntitlementStore((s) => s.entitlement);
  const commercial = commercialAvailability === "configured";
  const cloudEnabled = Boolean(
    commercial &&
      commercialSession &&
      entitlement?.capabilities.allowsCloudModels,
  );
  const cloudQuota = useCommercialQuota(cloudEnabled);
  const balance = cloudQuota.data?.spendableUnits;
  const isLoading = cloudQuota.isLoading;
  const isError = cloudQuota.isError;
  const isFetching = cloudQuota.isFetching;
  const language = i18n?.resolvedLanguage ?? i18n?.language ?? "en";

  if (isError || !cloudEnabled) {
    return null;
  }

  const tooltipLabel =
    balance === undefined
      ? t("modelQuota.balance")
      : `${t("modelQuota.balance")}: ${formatQuotaUnits(balance, language)}`;
  const handleRefresh = () => {
    if (isFetching) return;
    void cloudQuota.refetch();
  };

  return (
    <TooltipProvider delay={80}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="group/quota ml-1 flex h-9 min-w-0 cursor-pointer items-center gap-1 px-0.5 text-sm font-medium text-muted-foreground disabled:cursor-wait"
              aria-label={t("modelQuota.refreshBalance")}
              disabled={isFetching}
              onClick={handleRefresh}
            />
          }
        >
          <span className="flex shrink-0 items-center">
            <QuotaSparkIcon
              className={cn("size-[17px]", isFetching && "animate-pulse")}
              withHoverMotion
            />
          </span>
          <span className={cn("shrink-0 whitespace-nowrap text-[12px] leading-none tabular-nums", QUOTA_VALUE_CLASS)}>
            {isLoading || balance === undefined ? "--" : formatQuotaUnits(balance, language)}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          sideOffset={10}
          showArrow={false}
          className="border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {tooltipLabel} · {t("modelQuota.refreshHint")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
