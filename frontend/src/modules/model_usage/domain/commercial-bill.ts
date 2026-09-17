export interface CommercialBillLine {
  code: string; label: string; meter: string; quantity: string; billedQuantity: string;
  unit: string; unitQuantity: string; unitPrice: string; standardMicroPoints: string;
  chargedMicroPoints: string; calculation: string;
}

export interface CommercialConsumptionBill {
  id: string; invocationId: string; billingVersion: "METERED_V2"; settlementStatus: string;
  pricingVersion: string; tenantMultiplier: string; standardMicroPoints: string;
  chargedMicroPoints: string; adjustedMicroPoints: string; reservedMicroPoints: string;
  releasedMicroPoints: string; usageQuality: string; lines: CommercialBillLine[];
  dimensions: Array<{ name: string; value: string }>; calculationHash: string; createdAt: string; settledAt: string;
}

// A confirmed no-charge outcome is different from missing usage or a pending
// settlement. Keep this distinction shared by the renderer and its tests.
export function hasFinalBillAmount(status: string): boolean {
  return ["SETTLED", "FAILED_NO_CHARGE", "RELEASED", "ADJUSTED"].includes(status);
}

export function formatBillPoints(raw: string): string {
  if (!/^(0|-?[1-9][0-9]{0,15})$/u.test(raw)) throw new Error("Invalid exact point amount");
  const signed = BigInt(raw); const units = signed < BigInt(0) ? -signed : signed;
  if (units > BigInt("9000000000000000")) throw new Error("Point amount exceeds the supported range");
  const whole = units / BigInt(1000000);
  const fraction = (units % BigInt(1000000)).toString().padStart(6, "0").replace(/0+$/u, "");
  return `${signed < BigInt(0) ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function parseCommercialBill(value: unknown, invocationId: string): CommercialConsumptionBill {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid consumption bill");
  const bill = value as CommercialConsumptionBill;
  const scalar = ["id", "invocationId", "billingVersion", "settlementStatus", "pricingVersion", "tenantMultiplier", "standardMicroPoints", "chargedMicroPoints",
    "adjustedMicroPoints", "reservedMicroPoints", "releasedMicroPoints", "usageQuality", "calculationHash", "createdAt", "settledAt"];
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== scalar.length + 2 || scalar.some((key) => typeof row[key] !== "string" || (row[key] as string).length > 16000)
    || bill.invocationId !== invocationId || bill.billingVersion !== "METERED_V2" || !Array.isArray(bill.lines) || bill.lines.length > 512
    || !Array.isArray(bill.dimensions) || bill.dimensions.length > 128) throw new Error("Consumption bill does not match the public contract");
  for (const key of ["standardMicroPoints", "chargedMicroPoints", "adjustedMicroPoints", "reservedMicroPoints", "releasedMicroPoints"]) formatBillPoints(String(row[key]));
  const fields = ["code", "label", "meter", "quantity", "billedQuantity", "unit", "unitQuantity", "unitPrice", "standardMicroPoints", "chargedMicroPoints", "calculation"];
  for (const line of bill.lines) {
    if (!line || typeof line !== "object" || Object.keys(line).length !== fields.length || fields.some((key) => typeof (line as unknown as Record<string, unknown>)[key] !== "string") || line.meter.startsWith("supplier_")) throw new Error("Invalid public bill line");
    formatBillPoints(line.standardMicroPoints); formatBillPoints(line.chargedMicroPoints);
  }
  for (const dimension of bill.dimensions) {
    if (!dimension || Object.keys(dimension).length !== 2 || typeof dimension.name !== "string" || typeof dimension.value !== "string" || dimension.name.startsWith("supplier_")) throw new Error("Invalid public bill dimension");
  }
  return bill;
}
