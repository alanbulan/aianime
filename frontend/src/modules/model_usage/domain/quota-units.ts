// Ledger integers keep their original asset unit. Formatting never relabels a
// legacy record using today's model catalogue or the tenant's latest asset mode.
export function formatCommercialUnits(value: number, billingVersion?: string): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid quota amount");
  if (billingVersion !== "METERED_V2") return String(value);
  const units = BigInt(value);
  const whole = units / BigInt(100000000);
  const fraction = (units % BigInt(100000000)).toString().padStart(8, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
