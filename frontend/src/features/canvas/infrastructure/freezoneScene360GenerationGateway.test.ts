// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";
import { ensureBackendImageUrl } from "./freezoneAssetGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));
vi.mock("./freezoneAssetGateway", () => ({ ensureBackendImageUrl: vi.fn() }));

import { freezoneScene360GenerationGateway } from "./freezoneScene360GenerationGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
  vi.mocked(ensureBackendImageUrl).mockReset();
});

describe("freezoneScene360GenerationGateway", () => {
  it("normalizes the reference and maps the command to the encoded endpoint", async () => {
    const task = {
      task_key: "scene-360-task",
      task_type: "freezone_scene_360",
      job_id: "scene-360-job",
    };
    vi.mocked(ensureBackendImageUrl).mockResolvedValue("/static/source.png");
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneScene360GenerationGateway.submit("project/1", {
        referenceUrl: "data:image/png;base64,eA==",
        aspectRatio: "21:9",
      }),
    ).resolves.toBe(task);
    expect(ensureBackendImageUrl).toHaveBeenCalledWith(
      "project/1",
      "data:image/png;base64,eA==",
    );
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/scene-360",
      {
        method: "POST",
        json: {
          reference_url: "/static/source.png",
          image_size: "2K",
          mode: "candidate",
          aspect_ratio: "21:9",
        },
      },
    );
  });
});
