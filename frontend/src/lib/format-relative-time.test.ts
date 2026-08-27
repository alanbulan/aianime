// Copyright (c) 2026 AI anime
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { formatGeneratedAgeLabel } from "@/lib/format-relative-time";

const t = ((key: string, values?: Record<string, unknown>) => {
  const value = String(values?.value ?? "");
  if (key === "common.generatedAgo.second") return `${value}秒前`;
  if (key === "common.generatedAgo.minute") return `${value}分钟前`;
  if (key === "common.generatedAgo.hour") return `${value}小时前`;
  if (key === "common.generatedAgo.day") return `${value}天前`;
  if (key === "common.generatedAgo.tooltip") {
    return `生成于 ${String(values?.time ?? "")}`;
  }
  return key;
}) as TFunction;

describe("formatGeneratedAgeLabel", () => {
  const now = Date.parse("2026-08-27T10:00:00Z");

  it("uses a compact unambiguous label and keeps decimal detail in the tooltip", () => {
    expect(
      formatGeneratedAgeLabel("2026-08-27T03:06:00Z", t, now),
    ).toEqual({
      label: "6小时前",
      tooltip: "生成于 6.9小时前",
    });
  });

  it("formats minutes and days with an explicit ago suffix", () => {
    expect(
      formatGeneratedAgeLabel("2026-08-27T09:42:00Z", t, now),
    ).toEqual({
      label: "18分钟前",
      tooltip: "生成于 18分钟前",
    });
    expect(
      formatGeneratedAgeLabel("2026-08-25T04:00:00Z", t, now),
    ).toEqual({
      label: "2天前",
      tooltip: "生成于 2.2天前",
    });
  });

  it("omits invalid timestamps", () => {
    expect(formatGeneratedAgeLabel(null, t, now)).toBeNull();
    expect(formatGeneratedAgeLabel("invalid", t, now)).toBeNull();
  });
});
