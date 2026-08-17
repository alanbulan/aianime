// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";

import { CREDIT_VALUE_CLASS, CreditSparkIcon } from "@/components/credit-visual";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useAuthStore,
  useCommercialAuthStore,
  useCommercialEntitlementStore,
  useCurrentUser,
} from "@/modules/identity_access/public";
import { useCommercialQuota } from "@/modules/model_usage/public";
import { isCeRuntime } from "@/lib/runtime-config";
import { cn } from "@/lib/utils";

function formatFullCredits(value: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);
}

export function CreditBalanceBadge() {
  // Hooks must run unconditionally (Rules of Hooks); gate the CE/auth checks
  // after them. `useCurrentUser` stays disabled in CE so we don't fetch there.
  const ce = isCeRuntime();
  const { t, i18n } = useTranslation();
  const username = useAuthStore((s) => s.username);
  const commercialAvailability = useCommercialAuthStore((s) => s.availability);
  const commercialSession = useCommercialAuthStore((s) => s.session);
  const entitlement = useCommercialEntitlementStore((s) => s.entitlement);
  const commercial = commercialAvailability === "configured";
  const cloudEnabled = Boolean(
    commercial &&
      commercialSession &&
      entitlement?.capabilities.allowsCloudModels,
  );
  const currentUser = useCurrentUser(Boolean(username) && !ce && !commercial);
  const cloudQuota = useCommercialQuota(cloudEnabled);
  const balance = commercial
    ? cloudQuota.data?.spendableUnits
    : currentUser.data?.data.credit_balance;
  const isLoading = commercial ? cloudQuota.isLoading : currentUser.isLoading;
  const isError = commercial ? cloudQuota.isError : currentUser.isError;
  const isFetching = commercial ? cloudQuota.isFetching : currentUser.isFetching;
  const language = i18n?.resolvedLanguage ?? i18n?.language ?? "en";

  if (
    isError ||
    (commercial ? !cloudEnabled : ce || !username)
  ) {
    return null;
  }

  const tooltipLabel =
    balance === undefined
      ? t("credits.balance")
      : `${t("credits.balance")}: ${formatFullCredits(balance, language)}`;
  const handleRefresh = () => {
    if (isFetching) return;
    void (commercial ? cloudQuota.refetch() : currentUser.refetch());
  };

  return (
    <TooltipProvider delay={80}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="group/credits ml-1 flex h-9 min-w-0 cursor-pointer items-center gap-1 px-0.5 text-sm font-medium text-muted-foreground disabled:cursor-wait"
              aria-label={t("credits.refreshBalance")}
              disabled={isFetching}
              onClick={handleRefresh}
            />
          }
        >
          <span className="flex shrink-0 items-center">
            <CreditSparkIcon
              className={cn("size-[17px]", isFetching && "animate-pulse")}
              withHoverMotion
            />
          </span>
          <span className={cn("shrink-0 whitespace-nowrap text-[12px] leading-none tabular-nums", CREDIT_VALUE_CLASS)}>
            {isLoading || balance === undefined ? "--" : formatFullCredits(balance, language)}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          sideOffset={10}
          showArrow={false}
          className="border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {tooltipLabel} · {t("credits.refreshHint")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
