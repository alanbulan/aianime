// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const submitFreezoneImageTo3GS = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({ submitFreezoneImageTo3GS }));

import { freezoneImageTo3dGenerationGateway } from "./freezoneImageTo3dGenerationGateway";

describe("freezoneImageTo3dGenerationGateway", () => {
  it("maps the Canvas command to the image-to-3GS client", async () => {
    const task = {
      job_id: "job-1",
      task_key: "task-1",
      task_type: "freezone_image_to_3gs",
    };
    submitFreezoneImageTo3GS.mockResolvedValue(task);

    await expect(
      freezoneImageTo3dGenerationGateway.submit("project-1", {
        sourceUrl: "/static/pano.png",
        sourceKind: "pano",
        canvasId: "canvas-1",
        nodeId: "world-1",
      }),
    ).resolves.toBe(task);
    expect(submitFreezoneImageTo3GS).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/pano.png",
      sourceKind: "pano",
      canvasId: "canvas-1",
      nodeId: "world-1",
    });
  });
});
