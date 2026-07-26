// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const submitFreezoneScene360 = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({ submitFreezoneScene360 }));

import { freezoneScene360GenerationGateway } from "./freezoneScene360GenerationGateway";

describe("freezoneScene360GenerationGateway", () => {
  it("maps the Canvas command to the Freezone client", async () => {
    const task = {
      task_key: "scene-360-task",
      task_type: "freezone_scene_360",
      job_id: "scene-360-job",
    };
    submitFreezoneScene360.mockResolvedValue(task);

    await expect(
      freezoneScene360GenerationGateway.submit("project-1", {
        referenceUrl: "/static/source.png",
        aspectRatio: "21:9",
      }),
    ).resolves.toBe(task);
    expect(submitFreezoneScene360).toHaveBeenCalledWith("project-1", {
      referenceUrl: "/static/source.png",
      aspectRatio: "21:9",
    });
  });
});
