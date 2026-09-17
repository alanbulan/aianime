import { CommercialApiError } from "./commercial-api-error.js";
import { exactMicroPoints } from "./commercial-metered-billing.js";

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

const BILL_FIELDS = ["id", "invocationId", "billingVersion", "settlementStatus", "pricingVersion", "tenantMultiplier", "standardMicroPoints",
  "chargedMicroPoints", "adjustedMicroPoints", "reservedMicroPoints", "releasedMicroPoints", "usageQuality", "lines", "dimensions", "calculationHash", "createdAt", "settledAt"];
const LINE_FIELDS = ["code", "label", "meter", "quantity", "billedQuantity", "unit", "unitQuantity", "unitPrice", "standardMicroPoints", "chargedMicroPoints", "calculation"];
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CommercialApiError("消费账单必须是对象");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== fields.length || fields.some((field) => !Object.hasOwn(row, field))) throw new CommercialApiError("消费账单字段不符合公开合同");
  return row;
}
function textFields(row: Record<string, unknown>, fields: string[]): void {
  if (fields.some((field) => typeof row[field] !== "string" || (row[field] as string).length > 16000)) throw new CommercialApiError("消费账单文本无效或过长");
}

// This DTO is deliberately narrower than the platform finance DTO. Unknown
// fields (including supplierCosts or audit payloads) never cross into Renderer.
export function projectConsumptionBill(value: unknown, invocationId: string): CommercialConsumptionBill {
  const row = object(value, BILL_FIELDS);
  textFields(row, BILL_FIELDS.filter((field) => field !== "lines" && field !== "dimensions"));
  if (row.invocationId !== invocationId || row.billingVersion !== "METERED_V2" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(String(row.id))) throw new CommercialApiError("消费账单与当前调用不一致");
  for (const field of ["standardMicroPoints", "chargedMicroPoints", "reservedMicroPoints", "releasedMicroPoints"]) exactMicroPoints(row[field]);
  const adjustment = String(row.adjustedMicroPoints);
  exactMicroPoints(adjustment.startsWith("-") ? adjustment.slice(1) : adjustment);
  if (!Array.isArray(row.lines) || row.lines.length > 512 || !Array.isArray(row.dimensions) || row.dimensions.length > 128) throw new CommercialApiError("消费账单明细数量无效");
  const lines = row.lines.map((item) => {
    const line = object(item, LINE_FIELDS); textFields(line, LINE_FIELDS);
    exactMicroPoints(line.standardMicroPoints); exactMicroPoints(line.chargedMicroPoints);
    if (String(line.meter).startsWith("supplier_")) throw new CommercialApiError("消费账单包含非公开用量");
    return { ...line } as unknown as CommercialBillLine;
  });
  const dimensions = row.dimensions.map((item) => {
    const dimension = object(item, ["name", "value"]); textFields(dimension, ["name", "value"]);
    if (String(dimension.name).startsWith("supplier_")) throw new CommercialApiError("消费账单包含非公开维度");
    return { name: dimension.name as string, value: dimension.value as string };
  });
  return { ...row, lines, dimensions } as unknown as CommercialConsumptionBill;
}
