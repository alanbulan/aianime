import type { TFunction } from "i18next";

export type CommercialValueGroup =
  | "edition"
  | "operation"
  | "quota"
  | "status";

export function commercialValueLabel(
  t: TFunction,
  group: CommercialValueGroup,
  value: string | undefined,
): string {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return "-";
  return t(`settings.values.${group}.${normalized}`, {
    defaultValue: value?.trim() || normalized,
  });
}
