// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({ apiRequest }));

import { freezoneSkillExecutionGateway } from "./freezoneSkillExecutionGateway";

beforeEach(() => {
  apiRequest.mockReset();
});

describe("freezoneSkillExecutionGateway", () => {
  it("submits a Skill run with encoded route identifiers", async () => {
    const response = { run_id: "run-1", status: "queued" };
    const json = vi.fn().mockResolvedValue(response);
    apiRequest.mockReturnValue({ json });
    const request = {
      skill_node_id: "node-1",
      resolved_inputs: [],
    };

    await expect(freezoneSkillExecutionGateway.startRun(
      "project/one",
      "freezone.skill/test",
      request,
    )).resolves.toBe(response);
    expect(apiRequest).toHaveBeenCalledWith(
      "projects/project%2Fone/freezone/skills/freezone.skill%2Ftest/run",
      { method: "POST", json: request },
    );
  });

  it("reads a Skill run result through the dedicated endpoint", async () => {
    const response = { run_id: "run/1", status: "completed", outputs: [] };
    const json = vi.fn().mockResolvedValue(response);
    apiRequest.mockReturnValue({ json });

    await expect(freezoneSkillExecutionGateway.getRunResult(
      "project-1",
      "run/1",
    )).resolves.toBe(response);
    expect(apiRequest).toHaveBeenCalledWith(
      "projects/project-1/freezone/skills/runs/run%2F1/result",
    );
  });
});
