// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadCommercialModelCatalog = vi.hoisted(() => vi.fn());
const resolveRequiredCatalogModelCode = vi.hoisted(() => vi.fn());
const awaitTaskCompletion = vi.hoisted(() => vi.fn());
const fetchCanvasGenerationResult = vi.hoisted(() => vi.fn());
const submitStoryScript = vi.hoisted(() => vi.fn());

vi.mock("@/modules/model_usage/public", () => ({
  loadCommercialModelCatalog,
  resolveRequiredCatalogModelCode,
}));

vi.mock("@/modules/task_execution/public", () => ({
  awaitTaskCompletion,
}));

vi.mock("./infrastructure/freezoneGenerationResultGateway", () => ({
  fetchCanvasGenerationResult,
}));

vi.mock("./infrastructure/freezoneStoryScriptGenerationGateway", () => ({
  freezoneStoryScriptGenerationGateway: {
    submit: submitStoryScript,
  },
}));

import {
  generateCanvasStoryScript,
  resolveCanvasTextModel,
} from "./textGenerationComposition";

beforeEach(() => {
  loadCommercialModelCatalog.mockReset();
  resolveRequiredCatalogModelCode.mockReset();
  awaitTaskCompletion.mockReset();
  fetchCanvasGenerationResult.mockReset();
  submitStoryScript.mockReset();
  loadCommercialModelCatalog.mockResolvedValue({
    items: [
      { code: "text-default", operation: "TEXT", isDefault: true },
      { code: "text-pro", operation: "TEXT", isDefault: false },
      { code: "image-default", operation: "IMAGE", isDefault: true },
    ],
  });
  resolveRequiredCatalogModelCode.mockReturnValue("text-default");
});

describe("resolveCanvasTextModel", () => {
  it("keeps an explicitly authorized TEXT catalog code", async () => {
    await expect(resolveCanvasTextModel(" text-pro ")).resolves.toBe(
      "text-pro",
    );
    expect(loadCommercialModelCatalog).toHaveBeenCalledWith("TEXT");
    expect(resolveRequiredCatalogModelCode).not.toHaveBeenCalled();
  });

  it("falls back to the catalog's required TEXT model", async () => {
    await expect(resolveCanvasTextModel("unknown-model")).resolves.toBe(
      "text-default",
    );
    expect(resolveRequiredCatalogModelCode).toHaveBeenCalledWith(
      expect.objectContaining({ items: expect.any(Array) }),
      "TEXT",
    );
  });

  it("resolves the authorized model before running the story-script task", async () => {
    const task = {
      task_key: "story-task",
      task_type: "freezone_story_script",
      job_id: "story-job",
    };
    const scriptResult = {
      title: "Episode",
      rows: [{ shot_no: 1, dialogue: "Hello" }],
    };
    submitStoryScript.mockResolvedValue(task);
    awaitTaskCompletion.mockResolvedValue({ result: null });
    fetchCanvasGenerationResult.mockResolvedValue(scriptResult);
    const onTaskSubmitted = vi.fn();

    await expect(
      generateCanvasStoryScript(
        {
          projectId: "project-1",
          command: {
            sourceText: "Story",
            model: "text-pro",
            canvasId: "canvas-1",
            nodeId: "script-1",
          },
        },
        onTaskSubmitted,
      ),
    ).resolves.toEqual({ task, scriptResult });
    expect(submitStoryScript).toHaveBeenCalledWith("project-1", {
      sourceText: "Story",
      model: "text-pro",
      canvasId: "canvas-1",
      nodeId: "script-1",
    });
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
    expect(awaitTaskCompletion).toHaveBeenCalledWith(
      "story-task",
      "project-1",
    );
    expect(fetchCanvasGenerationResult).toHaveBeenCalledWith(
      "project-1",
      "freezone_story_script",
      "story-job",
    );
  });
});
