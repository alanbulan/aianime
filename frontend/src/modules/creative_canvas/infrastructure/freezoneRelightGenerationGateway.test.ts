// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneRelightGenerationGateway } from "./freezoneRelightGenerationGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneRelightGenerationGateway", () => {
  it("maps the prepared source command to the encoded endpoint", async () => {
    const task = {
      task_key: "relight-task",
      task_type: "freezone_relight",
      job_id: "relight-job",
    };
    vi.mocked(apiCall).mockResolvedValue(task);
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
      freezoneRelightGenerationGateway.submit("project/1", command),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/relight",
      {
        method: "POST",
        json: {
          source_url: "/static/source.png",
          lighting_reference_url: null,
          scope: "global",
          smart_mode: true,
          brightness: 72,
          color_hex: "#ffeecc",
          color_temperature_kelvin: 4200,
          key_light_direction: "left",
          rim_light: true,
          prompt: "golden hour",
          image_size: "2K",
          model: "image-model",
        },
      },
    );
  });
});
