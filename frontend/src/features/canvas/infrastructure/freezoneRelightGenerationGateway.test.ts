// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const submitFreezoneRelight = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({ submitFreezoneRelight }));

import { freezoneRelightGenerationGateway } from "./freezoneRelightGenerationGateway";

describe("freezoneRelightGenerationGateway", () => {
  it("maps the Canvas command to the Freezone client", async () => {
    const task = {
      task_key: "relight-task",
      task_type: "freezone_relight",
      job_id: "relight-job",
    };
    submitFreezoneRelight.mockResolvedValue(task);
    const command = {
      sourceUrl: "/static/source.png",
      lightingReferenceUrl: null,
      scope: "global" as const,
      smartMode: true,
      brightness: 72,
      colorHex: "#ffeecc",
      colorTemperatureKelvin: 4200,
      keyLightDirection: "left" as const,
      rimLight: true,
      prompt: "golden hour",
      imageSize: "2K",
      model: "image-model",
    };

    await expect(
      freezoneRelightGenerationGateway.submit("project-1", command),
    ).resolves.toBe(task);
    expect(submitFreezoneRelight).toHaveBeenCalledWith("project-1", command);
  });
});
