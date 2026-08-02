// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  generateCanvasRelight,
  type CanvasRelightGenerationGateway,
} from "./generateCanvasRelight";
import type { CanvasTaskResultGateway } from "@/modules/creative_canvas/public";

describe("generateCanvasRelight", () => {
  it("projects editor values and completes the submitted task", async () => {
    const task = {
      task_key: "relight-task",
      task_type: "freezone_relight",
      job_id: "relight-job",
    };
    const submissionGateway: CanvasRelightGenerationGateway = {
      submit: vi.fn().mockResolvedValue(task),
    };
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: "/static/relit.png" },
      }),
      fetchResultUrl: vi.fn(),
    };
    const onTaskSubmitted = vi.fn();

    await expect(
      generateCanvasRelight(
        {
          projectId: "project-1",
          sourceUrl: "/static/source.png?v=42",
          brightness: 72,
          colorHex: "#ffeecc",
          colorTemperatureKelvin: 4200,
          keyLightCandidate: "left",
          rimLight: true,
          smartMode: {
            enabled: true,
            prompt: "keep facial detail",
            presetPrompt: "golden hour",
          },
          imageSize: "2K",
          model: "image-model",
        },
        { submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, url: "/static/relit.png" });
    expect(submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.png",
      lightingReferenceUrl: null,
      scope: "global",
      smartMode: true,
      brightness: 72,
      colorHex: "#ffeecc",
      colorTemperatureKelvin: 4200,
      keyLightDirection: "left",
      rimLight: true,
      prompt: "keep facial detail\ngolden hour",
      imageSize: "2K",
      model: "image-model",
    });
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
  });
});
