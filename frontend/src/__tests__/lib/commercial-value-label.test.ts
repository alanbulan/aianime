import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { commercialValueLabel } from "@/shared/commercial-value-label";

const translations: Record<string, string> = {
  "settings.values.edition.PROFESSIONAL": "专业版",
  "settings.values.operation.IMAGE": "图片",
  "settings.values.quota.COMMITTED": "已提交",
  "settings.values.quota.DISPATCHING": "调度中",
  "settings.values.quota.RELEASED": "已释放",
  "settings.values.quota.REVIEW_REQUIRED": "需复核",
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
    expect(commercialValueLabel(t, "quota", "dispatching")).toBe("调度中");
    expect(commercialValueLabel(t, "quota", "committed")).toBe("已提交");
    expect(commercialValueLabel(t, "quota", "review_required")).toBe("需复核");
  });

  it("keeps unknown service values visible and handles empty values", () => {
    expect(commercialValueLabel(t, "status", "CUSTOM_STATE")).toBe(
      "CUSTOM_STATE",
    );
    expect(commercialValueLabel(t, "status", undefined)).toBe("-");
  });
});
