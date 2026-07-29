// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import type { FreezoneCanvasSummary } from "@/features/freezone/public";
import {
  buildCanvasBrowserSections,
  canDeleteCanvasSummary,
  canvasKindFromSummary,
  findDuplicateCanvasName,
  userCreatedCanvasId,
} from "@/features/freezone/CanvasesTab";
import { hasLegacyPresetCanvasMetadata } from "@/features/freezone/projections";
import {
  buildConflictCopyCanvasId,
  buildConflictCopyMetadata,
} from "@/features/freezone/application/canvasSyncStorage";

function canvas(
  id: string,
  canvas_scope?: string,
  modified_at = "2026-06-03T00:00:00Z",
  extra: Partial<FreezoneCanvasSummary> = {},
): FreezoneCanvasSummary {
  return {
    id,
    canvas_scope,
    modified_at,
    size: 1,
    ...extra,
  };
}

describe("freezone canvas browser sections", () => {
  it("places my canvas first and keeps old canvases under other canvases", () => {
    const sections = buildCanvasBrowserSections(
      [
        canvas("ep1_beat1", "beat", "2026-06-03T10:00:00Z", { episode: 1, beat: 1 }),
        canvas("ep1_beat2", "beat", "2026-06-03T11:00:00Z", { episode: 1, beat: 2 }),
        canvas("ep2_beat1", "beat", "2026-06-03T12:00:00Z", { episode: 2, beat: 1 }),
        canvas("asset_1", "asset", "2026-06-03T13:00:00Z"),
        canvas("default", "default", "2026-06-01T00:00:00Z"),
      ],
      "default",
      "eric@example.com",
    );

    expect(sections.defaultCanvas.id).toBe("user_eric_example_com_1m9fjbn");
    expect(sections.defaultCanvas.displayName).toBe("eric@example.com");
    expect(sections.memberCanvases).toEqual([]);
    expect(sections.otherCanvases.map((item) => item.id)).toEqual([
      "asset_1",
      "ep2_beat1",
      "ep1_beat2",
      "ep1_beat1",
      "default",
    ]);
  });

  it("separates member canvases from old and scratch canvases", () => {
    const sections = buildCanvasBrowserSections(
      [
        canvas("default", "default"),
        canvas("user_eric_example_com_1m9fjbn", undefined, "2026-06-03T13:00:00Z"),
        canvas("user_director_example_com_abc123", undefined, "2026-06-03T12:00:00Z"),
        canvas("asset_1", "asset", "2026-06-03T11:00:00Z"),
        canvas("scratch", "blank", "2026-06-03T10:00:00Z"),
        canvas("ep1_beat1", "beat", "2026-06-03T09:00:00Z", { episode: 1, beat: 1 }),
      ],
      "default",
      "eric@example.com",
    );

    expect(sections.defaultCanvas.id).toBe("user_eric_example_com_1m9fjbn");
    expect(sections.memberCanvases.map((item) => item.id)).toEqual(["user_director_example_com_abc123"]);
    expect(sections.otherCanvases.map((item) => item.id)).toEqual([
      "asset_1",
      "scratch",
      "ep1_beat1",
      "default",
    ]);
  });

  it("creates a placeholder personal canvas when it does not exist yet", () => {
    const sections = buildCanvasBrowserSections([canvas("default", "default")], "default", "林知微");

    expect(sections.defaultCanvas).toMatchObject({
      id: "user_u_klqmat",
      displayName: "林知微",
      size: 0,
    });
    expect(sections.otherCanvases.map((item) => item.id)).toEqual(["default"]);
  });

  it("keeps conflict copies under other canvases", () => {
    const sections = buildCanvasBrowserSections(
      [
        canvas("user_eric_example_com_1m9fjbn", undefined, "2026-06-03T13:00:00Z"),
        canvas("user_director_example_com_abc123", undefined, "2026-06-03T12:00:00Z"),
        canvas("copy_1790000000000_ab12cd_user_eric_example_com", undefined, "2026-06-03T14:00:00Z", {
          metadata: {
            canvas_origin: "conflict_copy",
            source_canvas_id: "user_eric_example_com_1m9fjbn",
          },
        }),
        canvas("user_eric_example_com_1m9fjbn_copy_1790000000000", undefined, "2026-06-03T11:00:00Z"),
      ],
      "user_eric_example_com_1m9fjbn",
      "eric@example.com",
    );

    expect(sections.memberCanvases.map((item) => item.id)).toEqual(["user_director_example_com_abc123"]);
    expect(sections.otherCanvases.map((item) => item.id)).toEqual([
      "copy_1790000000000_ab12cd_user_eric_example_com",
      "user_eric_example_com_1m9fjbn_copy_1790000000000",
    ]);
  });

  it("places user-created canvases under member canvases for shared browsing", () => {
    const sections = buildCanvasBrowserSections(
      [
        canvas("default", "default"),
        canvas("canvas_story_lab_abc123", undefined, "2026-06-03T13:00:00Z", {
          metadata: {
            canvas_origin: "user_created",
            display_name: "故事实验",
            creator_username: "alice",
          },
        }),
      ],
      "default",
      "eric@example.com",
    );

    expect(sections.memberCanvases.map((item) => item.id)).toEqual(["canvas_story_lab_abc123"]);
    expect(sections.otherCanvases.map((item) => item.id)).toEqual(["default"]);
  });

  it("shows user-created canvases as blank canvases even when backend scope is default", () => {
    expect(
      canvasKindFromSummary(
        canvas("canvas_story_lab_abc123", "default", "2026-06-03T13:00:00Z", {
          metadata: {
            canvas_origin: "user_created",
            display_name: "故事实验",
            creator_username: "alice",
          },
        }),
      ),
    ).toBe("blank");
  });

  it("detects duplicate user-facing canvas names", () => {
    const t = (key: string, options?: Record<string, unknown>) =>
      key === "freezone.canvases.description.default"
        ? "默认画布"
        : String(options?.name ?? key);
    const items = [
      canvas("canvas_story_lab_abc123", undefined, "2026-06-03T13:00:00Z", {
        metadata: {
          canvas_origin: "user_created",
          display_name: "故事实验",
          creator_username: "alice",
        },
      }),
    ];

    expect(findDuplicateCanvasName(items, " 故事实验 ", t)?.id).toBe("canvas_story_lab_abc123");
    expect(findDuplicateCanvasName(items, "新的画布", t)).toBeNull();
  });

  it("builds stable user-created canvas ids from username and name", () => {
    expect(userCreatedCanvasId("故事实验", "alice")).toBe(userCreatedCanvasId("故事实验", "alice"));
    expect(userCreatedCanvasId("故事实验", "alice")).not.toBe(userCreatedCanvasId("故事实验", "bob"));
    expect(userCreatedCanvasId("故事实验", "alice")).toMatch(/^canvas_canvas_[a-z0-9]+$/);
  });

  it("allows deleting only non-personal canvases", () => {
    expect(canDeleteCanvasSummary(canvas("user_eric_example_com_1m9fjbn"), "eric@example.com")).toBe(false);
    expect(canDeleteCanvasSummary(canvas("user_director_example_com_abc123"), "eric@example.com")).toBe(false);
    expect(
      canDeleteCanvasSummary(
        canvas("copy_179_ab_user_eric", undefined, "2026-06-03T00:00:00Z", {
          metadata: { canvas_origin: "conflict_copy", source_canvas_id: "user_eric_example_com_1m9fjbn" },
        }),
        "eric@example.com",
      ),
    ).toBe(true);
    expect(canDeleteCanvasSummary(canvas("default", "default"), "eric@example.com")).toBe(true);
    expect(canDeleteCanvasSummary(canvas("asset_1", "asset"), "eric@example.com")).toBe(true);
  });
});

describe("freezone preset projection guards", () => {
  it("does not treat projection canvases as legacy preset canvases", () => {
    expect(hasLegacyPresetCanvasMetadata({ preset: { scope: "beat" } })).toBe(true);
    expect(
      hasLegacyPresetCanvasMetadata({
        preset: { scope: "beat" },
        projections: { "beat:1:4": { projection_key: "beat:1:4" } },
      }),
    ).toBe(false);
  });

});

describe("freezone conflict copy helpers", () => {
  it("builds copy ids that cannot be mistaken for personal canvases", () => {
    const copyId = buildConflictCopyCanvasId("user_admin_en845w", 1790000000000, "ab12cd");

    expect(copyId).toBe("copy_1790000000000_ab12cd_user_admin_en845w");
    expect(copyId.startsWith("user_")).toBe(false);
    expect(copyId.length).toBeLessThanOrEqual(64);
  });

  it("stamps conflict copy metadata with the source canvas id", () => {
    expect(
      buildConflictCopyMetadata({
        sourceCanvasId: "user_admin_en845w",
        metadata: { existing: true },
      }),
    ).toEqual({
      existing: true,
      canvas_origin: "conflict_copy",
      source_canvas_id: "user_admin_en845w",
    });
  });
});
