// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { sampleTask } from "@/__mocks__/msw/handlers/tasks";
import { taskOriginLink } from "@/modules/task_execution/public";

describe("taskOriginLink", () => {
  it("returns route info for sketch-family tasks", () => {
    expect(taskOriginLink(sampleTask({
      task_type: "sketch_regen",
      project: "demo",
      episode: 3,
    }))).toEqual({
      to: "/projects/$project/episodes/$episode/sketches",
      params: { project: "demo", episode: "3" },
    });
  });

  it("returns null when a task has no episode stage", () => {
    expect(taskOriginLink(sampleTask({ task_type: "build_characters" }))).toBeNull();
    expect(taskOriginLink(sampleTask({ task_type: "no_such_type_ever" }))).toBeNull();
  });
});
