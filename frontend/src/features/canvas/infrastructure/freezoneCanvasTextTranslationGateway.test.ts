// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchFreezoneTextTranslateResult = vi.hoisted(() => vi.fn());
const submitFreezoneTextTranslate = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({
  fetchFreezoneTextTranslateResult,
  submitFreezoneTextTranslate,
}));

import { freezoneCanvasTextTranslationGateway } from "./freezoneCanvasTextTranslationGateway";

beforeEach(() => {
  fetchFreezoneTextTranslateResult.mockReset();
  submitFreezoneTextTranslate.mockReset();
});

describe("freezoneCanvasTextTranslationGateway", () => {
  it("maps translation submissions and projects the result text", async () => {
    const task = {
      job_id: "job-1",
      task_key: "task-1",
      task_type: "freezone_text_translate",
    };
    submitFreezoneTextTranslate.mockResolvedValue(task);
    fetchFreezoneTextTranslateResult.mockResolvedValue({
      translated_text: "translated prompt",
      source_language: "zh",
      target_language: "en",
      node_type: "video",
    });

    await expect(
      freezoneCanvasTextTranslationGateway.submit("project-1", {
        text: "原始提示词",
        nodeType: "video",
        canvasId: "canvas-1",
        nodeId: "node-1",
      }),
    ).resolves.toEqual(task);
    expect(submitFreezoneTextTranslate).toHaveBeenCalledWith("project-1", {
      text: "原始提示词",
      nodeType: "video",
      canvasId: "canvas-1",
      nodeId: "node-1",
    });
    await expect(
      freezoneCanvasTextTranslationGateway.fetchTranslatedText(
        "project-1",
        "job-1",
      ),
    ).resolves.toBe("translated prompt");
    expect(fetchFreezoneTextTranslateResult).toHaveBeenCalledWith(
      "project-1",
      "job-1",
    );
  });
});
