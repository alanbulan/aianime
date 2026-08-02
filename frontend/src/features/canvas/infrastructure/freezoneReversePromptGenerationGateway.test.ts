// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";
import { prepareCanvasImageSource } from "@/modules/creative_canvas/public";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));
vi.mock("@/modules/creative_canvas/public", () => ({
  prepareCanvasImageSource: vi.fn(),
}));

import { freezoneReversePromptGenerationGateway } from "./freezoneReversePromptGenerationGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
  vi.mocked(prepareCanvasImageSource).mockReset();
});

describe("freezoneReversePromptGenerationGateway", () => {
  it("maps source preparation and submission to the encoded endpoint", async () => {
    const task = { task_key: "task-1", task_type: "reverse", job_id: "job-1" };
    vi.mocked(prepareCanvasImageSource).mockResolvedValue("/static/source.png");
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneReversePromptGenerationGateway.prepareSourceUrl(
        "project/1",
        "data:image/png;base64,source",
      ),
    ).resolves.toBe("/static/source.png");
    await expect(
      freezoneReversePromptGenerationGateway.submit("project/1", {
        sourceUrl: "/static/source.png",
        canvasId: "canvas-1",
        nodeId: "text-1",
      }),
    ).resolves.toBe(task);
    expect(prepareCanvasImageSource).toHaveBeenCalledWith(
      "project/1",
      "data:image/png;base64,source",
    );
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/image/reverse-prompt",
      {
        method: "POST",
        json: {
          source_url: "/static/source.png",
          canvas_id: "canvas-1",
          node_id: "text-1",
        },
      },
    );
  });
});
