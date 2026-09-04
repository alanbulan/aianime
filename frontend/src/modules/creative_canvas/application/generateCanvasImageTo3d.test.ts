// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  generateCanvasImageTo3d,
  type CanvasImageTo3dSubmissionGateway,
} from "./generateCanvasImageTo3d";
import type { CanvasTaskResultGateway } from "./completeCanvasMediaGenerationTask";

function dependencies(result: Record<string, unknown>) {
  const task = {
    job_id: "job-1",
    task_key: "task-1",
    task_type: "freezone_image_to_3gs",
  };
  const sourceGateway = {
    prepare: vi.fn().mockResolvedValue("/assets/prepared-pano.png"),
  };
  const submissionGateway: CanvasImageTo3dSubmissionGateway = {
    submit: vi.fn().mockResolvedValue(task),
  };
  const taskGateway: CanvasTaskResultGateway = {
    awaitCompletion: vi.fn().mockResolvedValue({ result }),
    fetchResultUrl: vi.fn().mockResolvedValue(""),
  };
  return {
    task,
    sourceGateway,
    submissionGateway,
    taskGateway,
    onTaskSubmitted: vi.fn(),
    now: vi.fn(() => 1234),
  };
}

const params = {
  projectId: "project-1",
  sourceUrl: "data:image/png;base64,cGFubw==",
  sourceKind: "pano" as const,
  canvasId: "canvas-1",
  nodeId: "world-1",
};

describe("generateCanvasImageTo3d", () => {
  it("prepares, submits, waits and maps the generated world source", async () => {
    const deps = dependencies({ output_url: "/static/world.sog" });

    await expect(generateCanvasImageTo3d(params, deps)).resolves.toEqual({
      task: deps.task,
      source: {
        id: "generated-sog:pano:1234",
        source_type: "sog",
        source_kind: "pano",
        label: "360 3DGS",
        ply_url: "/static/world.sog",
        url: "/static/world.sog",
        collision_glb_url: undefined,
        current: true,
      },
    });
    expect(deps.sourceGateway.prepare).toHaveBeenCalledWith(
      "project-1",
      "data:image/png;base64,cGFubw==",
    );
    expect(deps.submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/assets/prepared-pano.png",
      sourceKind: "pano",
      canvasId: "canvas-1",
      nodeId: "world-1",
    });
    expect(deps.onTaskSubmitted).toHaveBeenCalledWith(deps.task);
    expect(deps.onTaskSubmitted.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deps.taskGateway.awaitCompletion).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("rejects a completed task without a 3D world URL", async () => {
    const deps = dependencies({ status: "completed" });

    await expect(generateCanvasImageTo3d(params, deps)).rejects.toThrow(
      "未能在 task.result 中找到 3D 世界地址",
    );
  });

  it("recovers a 3D world URL from the durable result endpoint", async () => {
    const deps = dependencies({ status: "completed" });
    vi.mocked(deps.taskGateway.fetchResultUrl).mockResolvedValue(
      "/static/world-from-artifact.sog",
    );

    const generated = await generateCanvasImageTo3d(params, deps);

    expect(generated.source.ply_url).toBe(
      "/static/world-from-artifact.sog",
    );
    expect(deps.taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_image_to_3gs",
      "job-1",
    );
  });
});
