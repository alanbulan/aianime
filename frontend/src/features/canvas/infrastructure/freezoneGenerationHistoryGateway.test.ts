// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

import { ApiError } from "@/shared/api/errors";
import { freezoneGenerationHistoryGateway } from "./freezoneGenerationHistoryGateway";

const record = {
  schema_version: 1,
  canvas_id: "canvas-1",
  node_id: "node-1",
  recorded_at: "2026-07-01T00:00:00Z",
  id: "record-1",
  task_type: "freezone_gen",
  task_key: "task-1",
  job_id: "job-1",
  status: "completed",
  media_type: "image",
  result: { output_url: "image.png" },
  model: "model-1",
  gen_mode: "textToImage",
};

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneGenerationHistoryGateway", () => {
  it("maps node history records into the application DTO", async () => {
    vi.mocked(apiCall).mockResolvedValue({ records: [record] });

    await expect(
      freezoneGenerationHistoryGateway.fetchNode(
        "project/1",
        "canvas/1",
        "node/1",
        25,
      ),
    ).resolves.toEqual([record]);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/canvases/canvas%2F1/nodes/node%2F1/generation-history?limit=25",
    );
  });

  it("maps aggregate history records from the encoded canvas endpoint", async () => {
    vi.mocked(apiCall).mockResolvedValue({ records: [record] });

    await expect(
      freezoneGenerationHistoryGateway.fetchCanvas(
        "project/1",
        "canvas/1",
        500,
      ),
    ).resolves.toEqual([record]);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/canvases/canvas%2F1/generation-history?limit=500",
    );
  });

  it("maps an unavailable aggregate endpoint to null", async () => {
    vi.mocked(apiCall).mockRejectedValue(
      new ApiError("not found", 404),
    );

    await expect(
      freezoneGenerationHistoryGateway.fetchCanvas(
        "project-1",
        "canvas-1",
        500,
      ),
    ).resolves.toBeNull();
  });

  it("preserves non-404 aggregate failures", async () => {
    const error = new ApiError("server error", 500);
    vi.mocked(apiCall).mockRejectedValue(error);

    await expect(
      freezoneGenerationHistoryGateway.fetchCanvas(
        "project-1",
        "canvas-1",
        500,
      ),
    ).rejects.toBe(error);
  });
});
