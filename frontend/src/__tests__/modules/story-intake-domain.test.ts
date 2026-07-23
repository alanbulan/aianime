import { describe, expect, it } from "vitest";

import {
  hasIngestSettingsChanges,
  normalizeLegacyDefaults,
  resolveIngestSettings,
} from "@/modules/story_intake/domain/ingest-settings";
import {
  countBillableNovelChars,
  isActiveIngestionTask,
} from "@/modules/story_intake/domain/ingestion";

describe("story intake domain rules", () => {
  it("normalizes the historical default preset without changing explicit settings", () => {
    expect(
      normalizeLegacyDefaults({
        visual_style: "post_apocalyptic",
        narration_style: "third_person",
        ethnicity: "Japanese",
      }),
    ).toEqual({
      spine_template: "drama",
      visual_style: "chinese_period_drama",
      narration_style: "first_person",
      ethnicity: "Chinese",
    });

    expect(
      normalizeLegacyDefaults({
        spine_template: "narrated",
        visual_style: "anime",
        narration_style: "third_person",
        ethnicity: "Japanese",
      }),
    ).toEqual({
      spine_template: "narrated",
      visual_style: "anime",
      narration_style: "third_person",
      ethnicity: "Japanese",
    });
  });

  it("ignores narration-only differences for drama projects", () => {
    const settings = resolveIngestSettings(
      { spine_template: "drama", narration_style: "first_person" },
      {
        spine_template: "drama",
        visual_style: "anime",
        narration_style: "third_person",
        ethnicity: "Chinese",
      },
    );

    expect(
      hasIngestSettingsChanges(settings, {
        spine_template: "drama",
        visual_style: "anime",
        narration_style: "third_person",
        ethnicity: "Chinese",
      }),
    ).toBe(false);
  });

  it("counts billable characters and recognizes active ingest tasks", () => {
    expect(countBillableNovelChars("第一章\n  雨 巷\u3000")).toBe(5);
    expect(isActiveIngestionTask("ingest_fast", "running")).toBe(true);
    expect(isActiveIngestionTask("ingest_fast", "completed")).toBe(false);
    expect(isActiveIngestionTask("video_gen", "running")).toBe(false);
  });
});
