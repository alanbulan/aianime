// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneScene360GenerationGateway } from "./freezoneScene360GenerationGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneScene360GenerationGateway", () => {
  it("maps the prepared source command to the encoded endpoint", async () => {
    const task = {
      task_key: "scene-360-task",
      task_type: "freezone_scene_360",
      job_id: "scene-360-job",
    };
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneScene360GenerationGateway.submit("project/1", {
        referenceUrl: "/static/source.png",
        aspectRatio: "21:9",
        model: "cloud-image-standard",
      }),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/scene-360",
      {
        method: "POST",
        json: {
          reference_url: "/static/source.png",
          image_size: "2K",
          mode: "candidate",
          aspect_ratio: "21:9",
          model: "cloud-image-standard",
        },
      },
    );
  });
});
