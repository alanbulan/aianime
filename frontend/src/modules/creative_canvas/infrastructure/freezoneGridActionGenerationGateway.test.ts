// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneGridActionGenerationGateway } from "./freezoneGridActionGenerationGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneGridActionGenerationGateway", () => {
  it("maps the prepared source command to the encoded template-edit endpoint", async () => {
    const task = {
      task_key: "grid-action-task",
      task_type: "freezone_template_edit",
      job_id: "grid-action-job",
    };
    vi.mocked(apiCall).mockResolvedValue(task);
    const command = {
      canvasId: "canvas-1",
      nodeId: "result-1",
      sourceUrl: "/static/source.png",
      mode: "storyboard_25_grid" as const,
      prompt: "Storyboard 25-grid",
      model: "cloud-image-standard",
    };

    await expect(
      freezoneGridActionGenerationGateway.submit("project/1", command),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/template-edit",
      {
        method: "POST",
        json: {
          canvas_id: "canvas-1",
          node_id: "result-1",
          source_url: "/static/source.png",
          mode: "storyboard_25_grid",
          prompt: "Storyboard 25-grid",
          model: "cloud-image-standard",
        },
      },
    );
  });

});
