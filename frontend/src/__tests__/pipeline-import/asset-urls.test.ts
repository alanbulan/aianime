// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";
import {
  deriveDirectorRenderUrl,
  deriveSketchUrl,
  staticPrefixOf,
} from "@/pipeline-import/domain/asset-urls";

describe("pipeline import asset URL rules", () => {
  it("extracts the user and project static prefix", () => {
    expect(
      staticPrefixOf("/static/admin/project-a/assets/frames/frame.png?v=1"),
    ).toBe("/static/admin/project-a/");
    expect(staticPrefixOf("/static/projects/project-a/frame.png")).toBe(
      "/static/projects/project-a/",
    );
  });

  it("rejects missing and non-static anchor URLs", () => {
    expect(staticPrefixOf(null)).toBeNull();
    expect(staticPrefixOf(undefined)).toBeNull();
    expect(staticPrefixOf("")).toBeNull();
    expect(staticPrefixOf("/api/v1/projects/project-a/frame.png")).toBeNull();
    expect(
      staticPrefixOf("https://example.com/static/admin/project-a/x"),
    ).toBeNull();
  });

  it("derives the padded sketch path", () => {
    expect(
      deriveSketchUrl("/static/admin/project-a/frames/frame.png", 4, 7),
    ).toBe("/static/admin/project-a/sketches/ep004/beat_07.png");
  });

  it("derives the padded director render path", () => {
    expect(
      deriveDirectorRenderUrl(
        "/static/projects/project-a/videos/beat.mp4",
        12,
        5,
      ),
    ).toBe(
      "/static/projects/project-a/director_control_frames/ep012/beat_05/combined.png",
    );
  });

  it("does not derive asset paths without a static anchor", () => {
    expect(deriveSketchUrl(null, 1, 1)).toBeNull();
    expect(deriveDirectorRenderUrl("/media/frame.png", 1, 1)).toBeNull();
  });
});
