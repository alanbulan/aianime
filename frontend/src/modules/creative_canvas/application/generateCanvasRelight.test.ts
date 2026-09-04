// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasTaskResultGateway } from "./completeCanvasMediaGenerationTask";
import {
  generateCanvasRelight,
  type CanvasRelightGenerationGateway,
} from "./generateCanvasRelight";

describe("generateCanvasRelight", () => {
  it("prepares the source, projects editor values and completes the task", async () => {
    const task = {
      task_key: "relight-task",
      task_type: "freezone_relight",
      job_id: "relight-job",
    };
    const sourceGateway = { prepare: vi.fn().mockResolvedValue("/static/source.png") };
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
          sourceUrl: "data:image/png;base64,eA==",
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
          aspectRatio: "original",
          imageSize: "2K",
          model: "image-model",
        },
        { sourceGateway, submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, url: "/static/relit.png" });
    expect(sourceGateway.prepare).toHaveBeenCalledWith(
      "project-1",
      "data:image/png;base64,eA==",
    );
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
      aspectRatio: "original",
      imageSize: "2K",
      model: "image-model",
    });
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
  });
});
