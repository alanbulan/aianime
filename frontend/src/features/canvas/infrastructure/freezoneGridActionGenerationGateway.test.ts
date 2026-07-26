// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneGridActionGenerationGateway } from "./freezoneGridActionGenerationGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneGridActionGenerationGateway", () => {
  it("maps the Canvas command to the encoded template-edit endpoint", async () => {
    const task = {
      task_key: "grid-action-task",
      task_type: "freezone_template_edit",
      job_id: "grid-action-job",
    };
    vi.mocked(apiCall).mockResolvedValue(task);
    const command = {
      sourceUrl: "/static/source.png",
      mode: "storyboard_25_grid" as const,
      prompt: "Storyboard 25-grid",
    };

    await expect(
      freezoneGridActionGenerationGateway.submit("project/1", command),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/template-edit",
      {
        method: "POST",
        json: {
          source_url: "/static/source.png",
          mode: "storyboard_25_grid",
          prompt: "Storyboard 25-grid",
          image_size: "2K",
        },
      },
    );
  });
});
