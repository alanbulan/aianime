// Copyright (c) 2026 AI anime
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Laptop,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useCommercialEntitlementStore } from "@/modules/identity_access/composition";
import { commercialValueLabel } from "@/shared/commercial-value-label";

export function CommercialLicenseSection({
  active,
  bridgeAvailable,
}: {
  active: boolean;
  bridgeAvailable: boolean;
}) {
  const { t } = useTranslation();
  const status = useCommercialEntitlementStore((state) => state.status);
  const entitlement = useCommercialEntitlementStore((state) => state.entitlement);
  const error = useCommercialEntitlementStore((state) => state.error);
  const refresh = useCommercialEntitlementStore((state) => state.refresh);
  const refreshLease = useCommercialEntitlementStore((state) => state.refreshLease);
  const activate = useCommercialEntitlementStore(
    (state) => state.activateCurrentDevice,
  );
  const deactivate = useCommercialEntitlementStore(
    (state) => state.deactivateCurrentDevice,
  );
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  useEffect(() => {
    if (!active || !bridgeAvailable || status !== "idle") return;
    void refresh().catch(() => undefined);
  }, [active, bridgeAvailable, refresh, status]);

  const run = async (
    operation: () => Promise<unknown>,
    successMessage: string,
    fallback: string,
  ) => {
    try {
      await operation();
      toast.success(successMessage);
    } catch (operationError) {
      toast.error(errorMessage(operationError, fallback));
    }
  };

  if (!bridgeAvailable) {
    return <InlineNotice>{t("settings.account.desktopRequired")}</InlineNotice>;
  }

  return (
    <section className="space-y-5 px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Laptop className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t("settings.account.title")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("settings.account.licenseHint")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          data-ui-tooltip={t("settings.account.refresh")}
          aria-label={t("settings.account.refresh")}
          disabled={status === "loading"}
          onClick={() =>
            void run(
              refresh,
              t("settings.account.refreshed"),
              t("settings.account.refreshFailed"),
            )
          }
        >
          <RefreshCw className={status === "loading" ? "animate-spin" : ""} />
        </Button>
      </div>

      {status === "loading" && !entitlement ? (
        <div className="flex h-28 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : null}
      {error ? <InlineNotice compact>{error}</InlineNotice> : null}

      {entitlement ? (
        <>
          <div className="divide-y divide-border border-y border-border">
            <InfoRow
              label={t("settings.account.license")}
              value={
                entitlement.license?.versionName ??
                entitlement.license?.versionCode ??
                t("settings.account.unassigned")
              }
              detail={commercialValueLabel(
                t,
                "edition",
                entitlement.license?.editionType,
              )}
            />
            <InfoRow
              label={t("settings.account.licenseStatus")}
              value={
                entitlement.license?.status
                  ? commercialValueLabel(t, "status", entitlement.license.status)
                  : t("settings.account.unknown")
              }
              detail={formatDate(entitlement.license.validUntil)}
            />
            <InfoRow
              label={t("settings.account.device")}
              value={entitlement.device?.name ?? t("settings.account.notActivated")}
              detail={commercialValueLabel(
                t,
                "status",
                entitlement.activation?.status ?? entitlement.device?.status,
              )}
            />
            <InfoRow
              label={t("settings.account.activatedAt")}
              value={formatDate(entitlement.activation?.activatedAt) ?? "-"}
              detail={formatDate(entitlement.activation?.lastHeartbeatAt)}
            />
            <InfoRow
              label={t("settings.account.leaseExpiresAt")}
              value={formatDate(entitlement.lease?.expiresAt) ?? "-"}
              detail={entitlement.lease?.keyId}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {entitlement.capabilities.deviceActivated ? (
              <>
                <Button
                  type="button"
                  size="default"
                  variant="outline"
                  disabled={status === "loading" || !entitlement.lease}
                  onClick={() =>
                    void run(
                      refreshLease,
                      t("settings.account.leaseRefreshed"),
                      t("settings.account.leaseRefreshFailed"),
                    )
                  }
                >
                  <ShieldCheck />
                  {t("settings.account.refreshLease")}
                </Button>
                <Button
                  type="button"
                  size="default"
                  variant="destructive"
                  disabled={status === "loading"}
                  onClick={() => setConfirmDeactivate(true)}
                >
                  <Unplug />
                  {t("settings.account.deactivate")}
                </Button>
              </>
            ) : entitlement.license ? (
              <Button
                type="button"
                size="default"
                disabled={status === "loading"}
                onClick={() =>
                  void run(
                    activate,
                    t("settings.account.activated"),
                    t("settings.account.activationFailed"),
                  )
                }
              >
                <ShieldCheck />
                {t("settings.account.activate")}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.account.deactivateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.account.deactivateDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDeactivate(false);
                void run(
                  () => deactivate(t("settings.account.deactivateReason")),
                  t("settings.account.deactivated"),
                  t("settings.account.deactivateFailed"),
                );
              }}
            >
              {t("settings.account.confirmDeactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function CommercialAccountSection(
  props: React.ComponentProps<typeof CommercialLicenseSection>,
) {
  return <CommercialLicenseSection {...props} />;
}

function InfoRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  const visibleDetail = distinctInfoDetail(value, detail);

  return (
    <div className="grid min-h-14 grid-cols-[9rem_minmax(0,1fr)] items-center gap-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 text-right">
        <p className="truncate text-sm text-foreground">{value}</p>
        {visibleDetail ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {visibleDetail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function distinctInfoDetail(
  value: string,
  detail: string | undefined,
): string | undefined {
  return detail?.trim() === value.trim() ? undefined : detail;
}

function InlineNotice({
  children,
  compact = false,
}: React.PropsWithChildren<{ compact?: boolean }>) {
  return (
    <div
      className={
        compact
          ? "border-y border-warning/35 bg-warning/10 px-3 py-3 text-xs text-warning"
          : "mx-6 mt-6 border-y border-warning/35 bg-warning/10 px-3 py-3 text-xs text-warning"
      }
    >
      {children}
    </div>
  );
}

function formatDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
