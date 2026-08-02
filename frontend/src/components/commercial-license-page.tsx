import {
  AlertTriangle,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ensureCommercialBootstrap } from "@/app/commercial-access";
import {
  commercialEntitlementAllowsWorkspace,
  logoutAllSessions,
  useCommercialEntitlementStore,
} from "@/modules/identity_access/public";

type PendingAction = "activate" | "retry" | "logout" | null;

export function CommercialLicensePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useCommercialEntitlementStore((state) => state.status);
  const entitlement = useCommercialEntitlementStore(
    (state) => state.entitlement,
  );
  const entitlementError = useCommercialEntitlementStore(
    (state) => state.error,
  );
  const activateCurrentDevice = useCommercialEntitlementStore(
    (state) => state.activateCurrentDevice,
  );
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const activationRequired = Boolean(
    entitlement?.license && !entitlement.capabilities.deviceActivated,
  );
  const busy = status === "loading" || pendingAction !== null;

  useEffect(() => {
    if (status !== "idle") return;
    void ensureCommercialBootstrap().catch(() => undefined);
  }, [status]);

  const activate = async () => {
    setPendingAction("activate");
    setActionError(null);
    try {
      const next = await activateCurrentDevice();
      if (!commercialEntitlementAllowsWorkspace(next)) {
        throw new Error(t("license.activationIncomplete"));
      }
      await navigate({ to: "/", replace: true });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : t("license.activationFailed"),
      );
    } finally {
      setPendingAction(null);
    }
  };

  const retry = async () => {
    setPendingAction("retry");
    setActionError(null);
    try {
      const next = await ensureCommercialBootstrap();
      if (commercialEntitlementAllowsWorkspace(next)) {
        await navigate({ to: "/", replace: true });
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : t("license.loadFailed"),
      );
    } finally {
      setPendingAction(null);
    }
  };

  const logout = async () => {
    setPendingAction("logout");
    setActionError(null);
    try {
      await logoutAllSessions();
      await navigate({ to: "/login", replace: true });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : t("license.logoutFailed"),
      );
      setPendingAction(null);
    }
  };

  return (
    <main className="flex h-full min-h-[440px] items-center justify-center overflow-auto bg-background px-6 py-10 text-foreground">
      <section className="w-full max-w-xl" aria-labelledby="license-page-title">
        <div className="flex size-11 items-center justify-center rounded-md border border-border bg-muted text-foreground">
          {activationRequired ? (
            <ShieldCheck className="size-5" aria-hidden />
          ) : (
            <AlertTriangle className="size-5 text-warning" aria-hidden />
          )}
        </div>

        <h1 id="license-page-title" className="mt-5 text-2xl font-semibold">
          {t(
            activationRequired
              ? "license.activateTitle"
              : "license.requiredTitle",
          )}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t(
            activationRequired
              ? "license.activateDescription"
              : "license.requiredDescription",
          )}
        </p>

        {entitlement?.license ? (
          <dl className="mt-7 grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 border-y border-border py-5 text-sm">
            <dt className="text-muted-foreground">{t("license.edition")}</dt>
            <dd className="min-w-0 font-medium">
              {entitlement.license.versionName ??
                entitlement.license.editionType}
            </dd>
            <dt className="text-muted-foreground">{t("license.device")}</dt>
            <dd className="min-w-0 truncate font-medium">
              {entitlement.device?.name ?? t("license.currentDevice")}
            </dd>
          </dl>
        ) : null}

        {actionError || entitlementError ? (
          <p
            className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-5 text-destructive"
            role="alert"
          >
            {actionError ?? entitlementError}
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center gap-2">
          {activationRequired ? (
            <Button type="button" size="lg" disabled={busy} onClick={() => void activate()}>
              {pendingAction === "activate" ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <ShieldCheck aria-hidden />
              )}
              {t("license.activateDevice")}
            </Button>
          ) : (
            <Button type="button" size="lg" disabled={busy} onClick={() => void retry()}>
              {pendingAction === "retry" ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              {t("license.retry")}
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            variant="ghost"
            disabled={busy}
            onClick={() => void logout()}
          >
            {pendingAction === "logout" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <LogOut aria-hidden />
            )}
            {t("auth.logout")}
          </Button>
        </div>
      </section>
    </main>
  );
}
