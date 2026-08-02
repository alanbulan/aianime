// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  queryCanvasGenerationHistory,
  queryNodeGenerationHistory,
  type CanvasGenerationHistoryGateway,
} from "./generationHistory";
import type {
  CanvasGenerationHistoryRecord,
} from "../domain/generationHistoryRecord";

function record(id: string, recordedAt: string): CanvasGenerationHistoryRecord {
  return {
    schema_version: 1,
    canvas_id: "canvas-1",
    node_id: "node-1",
    recorded_at: recordedAt,
    id,
    task_type: "freezone_gen",
    task_key: `task-${id}`,
    job_id: `job-${id}`,
    status: "completed",
    media_type: "image",
    result: { output_url: `${id}.png` },
  };
}

function gateway(): CanvasGenerationHistoryGateway {
  return {
    fetchNode: vi.fn().mockResolvedValue([]),
    fetchCanvas: vi.fn().mockResolvedValue([]),
  };
}

describe("generation history queries", () => {
  it("loads one node with the default history limit", async () => {
    const historyGateway = gateway();
    vi.mocked(historyGateway.fetchNode).mockResolvedValue([
      record("one", "2026-07-01T00:00:00Z"),
    ]);

    await expect(
      queryNodeGenerationHistory(
        {
          projectId: "project-1",
          canvasId: "canvas-1",
          nodeId: "node-1",
        },
        historyGateway,
      ),
    ).resolves.toHaveLength(1);
    expect(historyGateway.fetchNode).toHaveBeenCalledWith(
      "project-1",
      "canvas-1",
      "node-1",
      100,
    );
  });

  it("prefers the canvas aggregate endpoint", async () => {
    const historyGateway = gateway();
    const aggregate = [record("aggregate", "2026-07-02T00:00:00Z")];
    vi.mocked(historyGateway.fetchCanvas).mockResolvedValue(aggregate);

    await expect(
      queryCanvasGenerationHistory(
        {
          projectId: "project-1",
          canvasId: "canvas-1",
          fallbackNodeIds: ["node-1"],
        },
        historyGateway,
      ),
    ).resolves.toEqual(aggregate);
    expect(historyGateway.fetchCanvas).toHaveBeenCalledWith(
      "project-1",
      "canvas-1",
      500,
    );
    expect(historyGateway.fetchNode).not.toHaveBeenCalled();
  });

  it("falls back to node queries, ignores failures, deduplicates, and sorts", async () => {
    const historyGateway = gateway();
    const older = record("older", "2026-07-01T00:00:00Z");
    const newer = record("newer", "2026-07-03T00:00:00Z");
    vi.mocked(historyGateway.fetchCanvas).mockResolvedValue(null);
    vi.mocked(historyGateway.fetchNode).mockImplementation(
      async (_projectId, _canvasId, nodeId) => {
        if (nodeId === "failed") throw new Error("unavailable");
        if (nodeId === "node-1") return [older, newer];
        return [older];
      },
    );

    await expect(
      queryCanvasGenerationHistory(
        {
          projectId: "project-1",
          canvasId: "canvas-1",
          fallbackNodeIds: ["node-1", "failed", "node-2"],
        },
        historyGateway,
      ),
    ).resolves.toEqual([newer, older]);
    expect(historyGateway.fetchNode).toHaveBeenCalledTimes(3);
  });
});
