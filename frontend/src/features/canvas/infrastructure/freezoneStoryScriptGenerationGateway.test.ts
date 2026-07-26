// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

import { freezoneStoryScriptGenerationGateway } from "./freezoneStoryScriptGenerationGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneStoryScriptGenerationGateway", () => {
  it("maps the Canvas command to the encoded story-script endpoint", async () => {
    const task = { task_key: "task-1", task_type: "script", job_id: "job-1" };
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneStoryScriptGenerationGateway.submit("project/1", {
        sourceText: "Story",
        videoUrl: "/video.mp4",
        durationSec: 6,
        characterRefs: [{ imageUrl: "/hero.png", name: "Hero" }],
        prompt: "Cinematic",
        canvasId: "canvas-1",
        nodeId: "script-1",
      }),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/text/story-script",
      {
        method: "POST",
        json: {
          canvas_id: "canvas-1",
          node_id: "script-1",
          source_text: "Story",
          video_url: "/video.mp4",
          duration_sec: 6,
          prompt: "Cinematic",
          character_refs: [{ name: "Hero", image_url: "/hero.png" }],
        },
      },
    );
  });
});
