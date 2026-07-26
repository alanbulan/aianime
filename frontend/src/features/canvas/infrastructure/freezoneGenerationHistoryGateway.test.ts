// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchCanvasGenerationHistory = vi.hoisted(() => vi.fn());
const fetchNodeGenerationHistory = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({
  fetchCanvasGenerationHistory,
  fetchNodeGenerationHistory,
}));

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
  fetchCanvasGenerationHistory.mockReset();
  fetchNodeGenerationHistory.mockReset();
});

describe("freezoneGenerationHistoryGateway", () => {
  it("maps node history records into the application DTO", async () => {
    fetchNodeGenerationHistory.mockResolvedValue([record]);

    await expect(
      freezoneGenerationHistoryGateway.fetchNode(
        "project-1",
        "canvas-1",
        "node-1",
        25,
      ),
    ).resolves.toEqual([record]);
    expect(fetchNodeGenerationHistory).toHaveBeenCalledWith(
      "project-1",
      "canvas-1",
      "node-1",
      25,
    );
  });

  it("maps an unavailable aggregate endpoint to null", async () => {
    fetchCanvasGenerationHistory.mockRejectedValue(
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
    fetchCanvasGenerationHistory.mockRejectedValue(error);

    await expect(
      freezoneGenerationHistoryGateway.fetchCanvas(
        "project-1",
        "canvas-1",
        500,
      ),
    ).rejects.toBe(error);
  });
});
