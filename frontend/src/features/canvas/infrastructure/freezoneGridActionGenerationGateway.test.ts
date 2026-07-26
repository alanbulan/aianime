// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const submitFreezoneTemplateEdit = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({ submitFreezoneTemplateEdit }));

import { freezoneGridActionGenerationGateway } from "./freezoneGridActionGenerationGateway";

describe("freezoneGridActionGenerationGateway", () => {
  it("maps the Canvas command to the Freezone client", async () => {
    const task = {
      task_key: "grid-action-task",
      task_type: "freezone_template_edit",
      job_id: "grid-action-job",
    };
    submitFreezoneTemplateEdit.mockResolvedValue(task);
    const command = {
      sourceUrl: "/static/source.png",
      mode: "storyboard_25_grid" as const,
      prompt: "Storyboard 25-grid",
    };

    await expect(
      freezoneGridActionGenerationGateway.submit("project-1", command),
    ).resolves.toBe(task);
    expect(submitFreezoneTemplateEdit).toHaveBeenCalledWith(
      "project-1",
      command,
    );
  });
});
