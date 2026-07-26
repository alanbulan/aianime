// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneVideoSubtitleEraseGateway } from "./freezoneVideoSubtitleEraseGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneVideoSubtitleEraseGateway", () => {
  it("maps a box submission to the encoded erase endpoint", async () => {
    const task = {
      job_id: "job-1",
      task_key: "task-1",
      task_type: "freezone_video_erase",
    };
    const box = { x: 0.1, y: 0.7, width: 0.8, height: 0.2 };
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneVideoSubtitleEraseGateway.submit("project/1", {
        sourceUrl: "source.mp4",
        mode: "box",
        box,
      }),
    ).resolves.toEqual(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/video/erase",
      {
        method: "POST",
        json: {
          source_url: "source.mp4",
          mode: "box",
          box_x: 0.1,
          box_y: 0.7,
          box_width: 0.8,
          box_height: 0.2,
        },
      },
    );
  });

  it("omits box coordinates for smart subtitle erasure", async () => {
    vi.mocked(apiCall).mockResolvedValue({
      job_id: "job-2",
      task_key: "task-2",
      task_type: "freezone_video_erase",
    });

    await freezoneVideoSubtitleEraseGateway.submit("project-1", {
      sourceUrl: "source.mp4",
      mode: "smart_subtitle",
      box: null,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project-1/freezone/video/erase",
      {
        method: "POST",
        json: {
          source_url: "source.mp4",
          mode: "smart_subtitle",
        },
      },
    );
  });
});
