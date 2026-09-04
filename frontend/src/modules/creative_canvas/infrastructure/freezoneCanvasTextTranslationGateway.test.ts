// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneCanvasTextTranslationGateway } from "./freezoneCanvasTextTranslationGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneCanvasTextTranslationGateway", () => {
  it("maps translation submissions to the encoded endpoint", async () => {
    const task = {
      job_id: "job-1",
      task_key: "task-1",
      task_type: "freezone_text_translate",
    };
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneCanvasTextTranslationGateway.submit("project/1", {
        text: "原始提示词",
        model: "cloud-text-standard",
        nodeType: "video",
        canvasId: "canvas-1",
        nodeId: "node-1",
      }),
    ).resolves.toEqual(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/text/translate",
      {
        method: "POST",
        json: {
          text: "原始提示词",
          model: "cloud-text-standard",
          node_type: "video",
          canvas_id: "canvas-1",
          node_id: "node-1",
        },
      },
    );
  });
});
