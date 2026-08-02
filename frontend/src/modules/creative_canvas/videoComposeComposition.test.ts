// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("./infrastructure/freezoneVideoComposeGateway", () => ({
  freezoneVideoComposeGateway: { submit: mocks.submit },
}));

import {
  composeCanvasVideo,
  composeVideoClip,
} from "./videoComposeComposition";

const task = {
  job_id: "job-1",
  task_key: "task-1",
  task_type: "freezone_video_compose",
};

beforeEach(() => {
  mocks.awaitTaskCompletion.mockReset();
  mocks.fetchCanvasGenerationResultUrl.mockReset();
  mocks.submit.mockReset();
  mocks.submit.mockResolvedValue(task);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("videoComposeComposition", () => {
  it("composes a complete timeline through the module gateways", async () => {
    mocks.awaitTaskCompletion.mockResolvedValue({ result: {} });
    mocks.fetchCanvasGenerationResultUrl.mockResolvedValue("composed.mp4");

    await expect(
      composeCanvasVideo({
        projectId: "project-1",
        request: { tracks: [] },
      }),
    ).resolves.toEqual({ task, url: "composed.mp4" });
    expect(mocks.awaitTaskCompletion).toHaveBeenCalledWith(
      "task-1",
      "project-1",
    );
    expect(mocks.fetchCanvasGenerationResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_video_compose",
      "job-1",
    );
  });

  it("composes a single clip with the runtime clock", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_234);
    mocks.awaitTaskCompletion.mockResolvedValue({
      result: { output_url: "clip.mp4" },
    });

    await expect(
      composeVideoClip({
        projectId: "project-1",
        nodeId: "video-1",
        sourceUrl: "source.mp4",
        startMs: 250,
        endMs: 2_750,
        quality: "1080P",
      }),
    ).resolves.toEqual({ url: "clip.mp4", durationMs: 2_500 });
    expect(mocks.submit).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        resolution: "1080p",
        tracks: [
          expect.objectContaining({
            items: [expect.objectContaining({ itemId: "item_video-1_1234" })],
          }),
        ],
      }),
    );
  });
});
