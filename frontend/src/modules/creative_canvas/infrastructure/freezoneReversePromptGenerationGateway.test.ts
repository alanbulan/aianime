// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneReversePromptGenerationGateway } from "./freezoneReversePromptGenerationGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneReversePromptGenerationGateway", () => {
  it("maps the prepared source command to the encoded endpoint", async () => {
    const task = { task_key: "task-1", task_type: "reverse", job_id: "job-1" };
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneReversePromptGenerationGateway.submit("project/1", {
        sourceUrl: "/static/source.png",
        canvasId: "canvas-1",
        nodeId: "text-1",
      }),
    ).resolves.toBe(task);
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
