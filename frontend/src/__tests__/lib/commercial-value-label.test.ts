import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { commercialValueLabel } from "@/shared/commercial-value-label";

const translations: Record<string, string> = {
  "settings.values.edition.PROFESSIONAL": "专业版",
  "settings.values.operation.IMAGE": "图片",
  "settings.values.quota.RELEASED": "已释放",
  "settings.values.status.SUCCEEDED": "已成功",
};

const t = ((key: string, options?: { defaultValue?: string }) =>
  translations[key] ?? options?.defaultValue ?? key) as TFunction;

describe("commercial value labels", () => {
  it("localizes known commercial enum values", () => {
    expect(commercialValueLabel(t, "edition", "professional")).toBe("专业版");
    expect(commercialValueLabel(t, "operation", "IMAGE")).toBe("图片");
    expect(commercialValueLabel(t, "status", "SUCCEEDED")).toBe("已成功");
    expect(commercialValueLabel(t, "quota", "released")).toBe("已释放");
  });

  it("keeps unknown service values visible and handles empty values", () => {
    expect(commercialValueLabel(t, "status", "CUSTOM_STATE")).toBe(
      "CUSTOM_STATE",
    );
    expect(commercialValueLabel(t, "status", undefined)).toBe("-");
  });
});
