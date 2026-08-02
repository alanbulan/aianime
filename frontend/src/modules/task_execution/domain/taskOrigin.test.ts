// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { episodeRouteSegmentForTaskType } from "./taskOrigin";

describe("episodeRouteSegmentForTaskType", () => {
  it.each([
    ["script_writer", "/script"],
    ["sketch_regen", "/sketches"],
    ["audio_generation", "/audio"],
    ["single_video", "/video"],
    ["compose_episode", "/compose"],
  ])("maps %s to its episode route", (taskType, route) => {
    expect(episodeRouteSegmentForTaskType(taskType)).toBe(route);
  });

  it("does not map project-level or unknown tasks", () => {
    expect(episodeRouteSegmentForTaskType("build_characters")).toBeNull();
    expect(episodeRouteSegmentForTaskType("unknown")).toBeNull();
  });
});
