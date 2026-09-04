// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasStructuredTaskResultGateway } from "./completeCanvasMediaGenerationTask";
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
  };
  const taskGateway: CanvasStructuredTaskResultGateway = {
    awaitCompletion: vi.fn().mockResolvedValue({ result: {} }),
    fetchResult: vi.fn().mockResolvedValue({
      translated_text: "translated prompt",
    }),
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
    expect(deps.taskGateway.fetchResult).toHaveBeenCalledWith(
      "project-1",
      "freezone_text_translate",
      "job-1",
    );
  });

  it("uses translated text embedded in the completed task", async () => {
    const deps = dependencies();
    vi.mocked(deps.taskGateway.awaitCompletion).mockResolvedValue({
      result: { translated_text: "embedded translation" },
    });

    await expect(
      translateCanvasText(
        {
          projectId: "project-1",
          text: "原始提示词",
          model: "cloud-text-standard",
          nodeType: "text",
          canvasId: "canvas-1",
          nodeId: "node-1",
        },
        deps,
      ),
    ).resolves.toEqual({ translatedText: "embedded translation" });
    expect(deps.taskGateway.fetchResult).not.toHaveBeenCalled();
  });

  it("rejects a completed task without translated text", async () => {
    const deps = dependencies();
    vi.mocked(deps.taskGateway.fetchResult).mockResolvedValue({
      translated_text: "",
    });

    await expect(
      translateCanvasText(
        {
          projectId: "project-1",
          text: "原始提示词",
          model: "cloud-text-standard",
          nodeType: "text",
          canvasId: "canvas-1",
          nodeId: "node-1",
        },
        deps,
      ),
    ).rejects.toThrow("翻译任务已完成，但没有返回译文");
  });
});
