// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const ensureBackendImageUrl = vi.hoisted(() => vi.fn());
const submitFreezoneReversePrompt = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({
  ensureBackendImageUrl,
  submitFreezoneReversePrompt,
}));

import { freezoneReversePromptGenerationGateway } from "./freezoneReversePromptGenerationGateway";

describe("freezoneReversePromptGenerationGateway", () => {
  it("maps source preparation and submission to the Freezone client", async () => {
    const task = { task_key: "task-1", task_type: "reverse", job_id: "job-1" };
    ensureBackendImageUrl.mockResolvedValue("/static/source.png");
    submitFreezoneReversePrompt.mockResolvedValue(task);

    await expect(
      freezoneReversePromptGenerationGateway.prepareSourceUrl(
        "project-1",
        "data:image/png;base64,source",
      ),
    ).resolves.toBe("/static/source.png");
    await expect(
      freezoneReversePromptGenerationGateway.submit("project-1", {
        sourceUrl: "/static/source.png",
        canvasId: "canvas-1",
        nodeId: "text-1",
      }),
    ).resolves.toBe(task);
    expect(ensureBackendImageUrl).toHaveBeenCalledWith(
      "project-1",
      "data:image/png;base64,source",
    );
    expect(submitFreezoneReversePrompt).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.png",
      canvasId: "canvas-1",
      nodeId: "text-1",
    });
  });
});
