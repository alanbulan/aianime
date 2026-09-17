import { useTranslation } from "react-i18next";
import { formatBillPoints, hasFinalBillAmount, type CommercialConsumptionBill } from "../domain/commercial-bill";

export function ConsumptionBillExplanation({ bill }: { bill: CommercialConsumptionBill }) {
  const { t } = useTranslation();
  const settled = hasFinalBillAmount(bill.settlementStatus);
  return (
    <section className="mt-4 rounded-md border p-3" aria-label={t("settings.invocations.billExplanation")}>
      <h4 className="mb-2 text-sm font-medium">{t("settings.invocations.billExplanation")}</h4>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt>{t("settings.invocations.pricingVersion")}</dt><dd className="break-all">{bill.pricingVersion}</dd>
        <dt>{t("settings.invocations.tenantMultiplier")}</dt><dd>{bill.tenantMultiplier}</dd>
        <dt>{t("settings.invocations.usageQuality")}</dt><dd>{bill.usageQuality}</dd>
        <dt>{t("settings.invocations.standardPoints")}</dt><dd>{settled ? formatBillPoints(bill.standardMicroPoints) : t("settings.invocations.settlementPending")}</dd>
        <dt>{t("settings.invocations.chargedUnits")}</dt><dd>{settled ? formatBillPoints(bill.chargedMicroPoints) : t("settings.invocations.settlementPending")}</dd>
        <dt>{t("settings.invocations.adjustedPoints")}</dt><dd>{settled ? formatBillPoints(bill.adjustedMicroPoints) : t("settings.invocations.settlementPending")}</dd>
      </dl>
      {bill.dimensions.length > 0 && <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">{bill.dimensions.map((dimension) => <span key={dimension.name}>{dimension.name}: {dimension.value}</span>)}</div>}
      {settled && bill.lines.length > 0 ? <div className="mt-3 space-y-2">{bill.lines.map((line, index) => (
        <article className="rounded bg-muted/40 p-2 text-xs" key={`${line.code}:${index}`}>
          <div className="flex justify-between gap-3"><span>{line.label || line.code}</span><strong>{t("settings.invocations.meteredPointsValue", { amount: formatBillPoints(line.chargedMicroPoints) })}</strong></div>
          <p className="mt-1 break-words text-muted-foreground">{line.meter}: {line.quantity} {line.unit} · {t("settings.invocations.unitPrice")}: {line.unitPrice} / {line.unitQuantity || "1"}</p>
          {line.calculation && <p className="mt-1 break-words">{line.calculation}</p>}
        </article>
      ))}</div> : null}
      {bill.calculationHash && <p className="mt-3 break-all font-mono text-[10px] text-muted-foreground">{t("settings.invocations.calculationHash")}: {bill.calculationHash}</p>}
    </section>
  );
}
