// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasTaskResultGateway } from "./completeCanvasMediaGenerationTask";
import {
  translateCanvasText,
  type CanvasTextTranslationGateway,
} from "./translateCanvasText";

function dependencies() {
  const task = {
    job_id: "job-1",
    task_key: "task-1",
    task_type: "freezone_text_translate",
  };
  const translationGateway: CanvasTextTranslationGateway = {
    submit: vi.fn().mockResolvedValue(task),
    fetchTranslatedText: vi.fn().mockResolvedValue("translated prompt"),
  };
  const taskGateway: Pick<CanvasTaskResultGateway, "awaitCompletion"> = {
    awaitCompletion: vi.fn().mockResolvedValue({ result: {} }),
  };
  return { translationGateway, taskGateway };
}

describe("translateCanvasText", () => {
  it("submits node context, waits for completion, and returns translated text", async () => {
    const deps = dependencies();

    await expect(
      translateCanvasText(
        {
          projectId: "project-1",
          text: "原始提示词",
          model: "cloud-text-standard",
          nodeType: "video",
          canvasId: "canvas-1",
          nodeId: "node-1",
        },
        deps,
      ),
    ).resolves.toEqual({ translatedText: "translated prompt" });
    expect(deps.translationGateway.submit).toHaveBeenCalledWith("project-1", {
      text: "原始提示词",
      model: "cloud-text-standard",
      nodeType: "video",
      canvasId: "canvas-1",
      nodeId: "node-1",
    });
    expect(deps.taskGateway.awaitCompletion).toHaveBeenCalledWith(
      "task-1",
      "project-1",
    );
    expect(deps.translationGateway.fetchTranslatedText).toHaveBeenCalledWith(
      "project-1",
      "job-1",
    );
  });
});
