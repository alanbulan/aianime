// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type {
  SkillRunRequest,
  SkillRunResponse,
  SkillRunResult,
} from "@/features/freezone/public";

import {
  awaitCanvasSkillRunResult,
  startCanvasSkillRun,
  type CanvasSkillExecutionGateway,
} from "./skillExecution";

function result(status: string): SkillRunResult {
  return {
    run_id: "run-1",
    status,
    outputs: [],
  };
}

describe("Canvas skill execution", () => {
  it("submits the unchanged Skill request through the gateway", async () => {
    const response: SkillRunResponse = { run_id: "run-1", status: "queued" };
    const gateway: CanvasSkillExecutionGateway = {
      startRun: vi.fn().mockResolvedValue(response),
      getRunResult: vi.fn(),
    };
    const request: SkillRunRequest = {
      skill_node_id: "skill-node",
      canvas_id: "canvas-1",
      resolved_inputs: [],
    };

    await expect(startCanvasSkillRun({
      projectId: "project-1",
      skillId: "freezone.test",
      request,
    }, gateway)).resolves.toBe(response);
    expect(gateway.startRun).toHaveBeenCalledWith(
      "project-1",
      "freezone.test",
      request,
    );
  });

  it("polls until the Skill run reaches a terminal status", async () => {
    const completed = result("completed");
    const gateway: CanvasSkillExecutionGateway = {
      startRun: vi.fn(),
      getRunResult: vi
        .fn()
        .mockResolvedValueOnce(result("running"))
        .mockResolvedValueOnce(completed),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(awaitCanvasSkillRunResult(
      { projectId: "project-1", runId: "run-1" },
      { gateway, sleep },
    )).resolves.toBe(completed);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(700);
  });

  it("preserves the timeout error after the configured attempts", async () => {
    const gateway: CanvasSkillExecutionGateway = {
      startRun: vi.fn(),
      getRunResult: vi.fn().mockResolvedValue(result("running")),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(awaitCanvasSkillRunResult(
      {
        projectId: "project-1",
        runId: "run-timeout",
        maxAttempts: 2,
        pollDelayMs: 5,
      },
      { gateway, sleep },
    )).rejects.toThrow(
      "Skill run run-timeout did not finish; latest status: running",
    );
    expect(gateway.getRunResult).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
