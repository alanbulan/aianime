// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

import { freezoneImageTo3dGenerationGateway } from "./freezoneImageTo3dGenerationGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneImageTo3dGenerationGateway", () => {
  it("maps the Canvas command to the encoded image-to-3GS endpoint", async () => {
    const task = {
      job_id: "job-1",
      task_key: "task-1",
      task_type: "freezone_image_to_3gs",
    };
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneImageTo3dGenerationGateway.submit("project/1", {
        sourceUrl: "/assets/pano.png",
        sourceKind: "pano",
        canvasId: "canvas-1",
        nodeId: "world-1",
      }),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/image-to-3gs",
      {
        method: "POST",
        json: {
          source_url: "/assets/pano.png",
          source_kind: "pano",
          canvas_id: "canvas-1",
          node_id: "world-1",
        },
      },
    );
  });
});
