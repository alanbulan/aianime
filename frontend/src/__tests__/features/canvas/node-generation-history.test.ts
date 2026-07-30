// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { hasCompletedHistoryRecords } from "@/features/canvas/domain/generationHistoryRecord";
import type { CanvasGenerationHistoryRecord } from "@/features/canvas/application/generationHistory";

function record(status: string): CanvasGenerationHistoryRecord {
  return { id: `r-${status}`, status, recorded_at: "2026-06-15T00:00:00Z" } as unknown as CanvasGenerationHistoryRecord;
}

describe("hasCompletedHistoryRecords", () => {
  it("is false with no records", () => {
    expect(hasCompletedHistoryRecords([])).toBe(false);
  });

  it("is false when every record is failed/pending (the empty-box bug case)", () => {
    expect(hasCompletedHistoryRecords([record("failed"), record("pending")])).toBe(false);
  });

  it("is true when at least one record completed/succeeded", () => {
    expect(hasCompletedHistoryRecords([record("failed"), record("completed")])).toBe(true);
    expect(hasCompletedHistoryRecords([record("succeeded")])).toBe(true);
  });
});
