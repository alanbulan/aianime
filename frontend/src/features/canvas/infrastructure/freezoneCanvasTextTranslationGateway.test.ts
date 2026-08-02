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

  it("loads and projects translated text", async () => {
    vi.mocked(apiCall).mockResolvedValue({
      translated_text: "translated prompt",
      source_language: "zh",
      target_language: "en",
      node_type: "video",
    });

    await expect(
      freezoneCanvasTextTranslationGateway.fetchTranslatedText(
        "project/1",
        "job/1",
      ),
    ).resolves.toBe("translated prompt");
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/jobs/freezone_text_translate/job%2F1/result",
    );
  });
});
