// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const submitFreezoneStoryScript = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({ submitFreezoneStoryScript }));

import { freezoneStoryScriptGenerationGateway } from "./freezoneStoryScriptGenerationGateway";

describe("freezoneStoryScriptGenerationGateway", () => {
  it("maps the Canvas command to the Freezone client", async () => {
    const task = { task_key: "task-1", task_type: "script", job_id: "job-1" };
    submitFreezoneStoryScript.mockResolvedValue(task);

    await expect(
      freezoneStoryScriptGenerationGateway.submit("project-1", {
        sourceText: "Story",
        videoUrl: "/video.mp4",
        durationSec: 6,
        characterRefs: [{ imageUrl: "/hero.png", name: "Hero" }],
        prompt: "Cinematic",
        canvasId: "canvas-1",
        nodeId: "script-1",
      }),
    ).resolves.toBe(task);
    expect(submitFreezoneStoryScript).toHaveBeenCalledWith("project-1", {
      sourceText: "Story",
      videoUrl: "/video.mp4",
      durationSec: 6,
      characterRefs: [{ imageUrl: "/hero.png", name: "Hero" }],
      prompt: "Cinematic",
      canvasId: "canvas-1",
      nodeId: "script-1",
    });
  });
});
