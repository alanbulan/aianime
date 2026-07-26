// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitFreezoneVideoErase = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({
  submitFreezoneVideoErase,
}));

import { freezoneVideoSubtitleEraseGateway } from "./freezoneVideoSubtitleEraseGateway";

beforeEach(() => {
  submitFreezoneVideoErase.mockReset();
});

describe("freezoneVideoSubtitleEraseGateway", () => {
  it("maps the application submission to the erase API payload", async () => {
    const task = {
      job_id: "job-1",
      task_key: "task-1",
      task_type: "freezone_video_erase",
    };
    const box = { x: 0.1, y: 0.7, width: 0.8, height: 0.2 };
    submitFreezoneVideoErase.mockResolvedValue(task);

    await expect(
      freezoneVideoSubtitleEraseGateway.submit("project-1", {
        sourceUrl: "source.mp4",
        mode: "box",
        box,
      }),
    ).resolves.toEqual(task);
    expect(submitFreezoneVideoErase).toHaveBeenCalledWith("project-1", {
      sourceUrl: "source.mp4",
      mode: "box",
      box,
    });
  });
});
