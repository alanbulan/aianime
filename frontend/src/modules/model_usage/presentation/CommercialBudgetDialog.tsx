import { useEffect, useRef, useState } from "react";
import { Coins, Info, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useBudgetConfirmation } from "@/modules/model_usage/composition";
import { formatBudgetMultiplier, formatBudgetPoints, type BudgetPrompt } from "@/modules/model_usage/domain/budget-confirmation";

type Decision = (id: string, decision: "accept" | "cancel") => Promise<boolean>;

export function CommercialBudgetDialog() {
  const { state, decide } = useBudgetConfirmation();
  return state.request ? <CommercialBudgetPrompt key={state.request.requestId} request={state.request} pendingCount={state.pendingCount} decide={decide} /> : null;
}

export function CommercialBudgetPrompt({ request, pendingCount, decide }: { request: BudgetPrompt; pendingCount: number; decide: Decision }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "zh";
  const cancel = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((Date.parse(request.expiresAt) - now) / 1000));
  const valid = remaining > 0;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const submit = async (decision: "accept" | "cancel") => {
    if (inFlight.current || (decision === "accept" && Date.parse(request.expiresAt) <= Date.now())) return;
    inFlight.current = true;
    setBusy(true); setError(false);
    try {
      const applied = await decide(request.requestId, decision);
      if (!applied) setNow(Date.now());
    } catch { setError(true); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const time = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  return <Dialog open onOpenChange={(open) => { if (!open) void submit("cancel"); }}>
    <DialogContent showCloseButton={false} initialFocus={cancel}
      className="flex max-h-[calc(100dvh-64px)] w-[min(440px,calc(100vw-32px))] flex-col gap-0 overflow-hidden border border-border bg-card p-0 text-card-foreground shadow-xl ring-0 sm:max-w-[440px]">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><Coins className="size-4" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <DialogTitle className="text-base font-semibold leading-5">{t("budgetConfirmation.title")}</DialogTitle>
          <DialogDescription className="break-words text-xs leading-5" title={request.modelCode}>{request.modelName}</DialogDescription>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t("budgetConfirmation.close")} disabled={busy} onClick={() => void submit("cancel")}><X className="size-4" /></Button>
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto p-5">
        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="min-w-0 space-y-2"><dt className="text-xs text-muted-foreground">{t("budgetConfirmation.estimated")}</dt>
            <dd className="break-all text-xl font-semibold tabular-nums tracking-tight">{formatBudgetPoints(request.estimatedMicroPoints, locale)}<span className="ml-1 text-xs font-normal text-muted-foreground">{t("budgetConfirmation.points")}</span></dd></div>
          <div className="min-w-0 space-y-2 border-l border-border pl-3"><dt className="text-xs text-muted-foreground">{t("budgetConfirmation.maximum")}</dt>
            <dd className="break-all text-xl font-semibold tabular-nums tracking-tight">{formatBudgetPoints(request.maximumMicroPoints, locale)}<span className="ml-1 text-xs font-normal text-muted-foreground">{t("budgetConfirmation.points")}</span></dd></div>
        </dl>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" aria-hidden="true" />{t("budgetConfirmation.locked", { version: request.policyVersion })}</span>
          <span>{t("budgetConfirmation.multiplier", { value: formatBudgetMultiplier(request.tenantMultiplier) })}</span>
          <span className="ml-auto tabular-nums" aria-live="off">{valid ? t("budgetConfirmation.expires", { time }) : t("budgetConfirmation.expired")}</span>
        </div>
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{t("budgetConfirmation.hint")}</p>
        {pendingCount > 1 && <p className="text-xs text-muted-foreground">{t("budgetConfirmation.queue", { count: pendingCount - 1 })}</p>}
        {error && <p role="alert" className="text-xs leading-5 text-destructive">{t("budgetConfirmation.failed")}</p>}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3.5">
        <Button ref={cancel} variant="outline" disabled={busy} onClick={() => void submit("cancel")}>{t("budgetConfirmation.cancel")}</Button>
        <Button disabled={busy || !valid} onClick={() => void submit("accept")}>{busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}{t("budgetConfirmation.accept")}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
