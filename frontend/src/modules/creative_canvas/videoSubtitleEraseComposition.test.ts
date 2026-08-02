// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  awaitTaskCompletion: vi.fn(),
  fetchCanvasGenerationResultUrl: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("@/modules/task_execution/public", () => ({
  awaitTaskCompletion: mocks.awaitTaskCompletion,
}));
vi.mock("./infrastructure/freezoneGenerationResultGateway", () => ({
  fetchCanvasGenerationResultUrl: mocks.fetchCanvasGenerationResultUrl,
}));
vi.mock("./infrastructure/freezoneVideoSubtitleEraseGateway", () => ({
  freezoneVideoSubtitleEraseGateway: { submit: mocks.submit },
}));

import { eraseVideoSubtitles } from "./videoSubtitleEraseComposition";

const task = {
  job_id: "job-1",
  task_key: "task-1",
  task_type: "freezone_video_erase",
};

beforeEach(() => {
  mocks.awaitTaskCompletion.mockReset();
  mocks.fetchCanvasGenerationResultUrl.mockReset();
  mocks.submit.mockReset();
});

describe("videoSubtitleEraseComposition", () => {
  it("runs subtitle erasure through the module gateways", async () => {
    mocks.submit.mockResolvedValue(task);
    mocks.awaitTaskCompletion.mockResolvedValue({ result: {} });
    mocks.fetchCanvasGenerationResultUrl.mockResolvedValue("clean.mp4");

    await expect(
      eraseVideoSubtitles({
        projectId: "project-1",
        sourceUrl: "source.mp4",
        mode: "smart",
        box: null,
      }),
    ).resolves.toEqual({ url: "clean.mp4" });
    expect(mocks.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "source.mp4",
      mode: "smart_subtitle",
      box: null,
    });
    expect(mocks.awaitTaskCompletion).toHaveBeenCalledWith(
      "task-1",
      "project-1",
    );
    expect(mocks.fetchCanvasGenerationResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_video_erase",
      "job-1",
    );
  });
});
