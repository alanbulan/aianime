// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";
import { ApiError } from "@/shared/api/errors";

import type {
  CanvasGenerationHistoryGateway,
  CanvasGenerationHistoryRecord,
} from "../application/generationHistory";

function toCanvasRecord(
  record: CanvasGenerationHistoryRecord,
): CanvasGenerationHistoryRecord {
  return {
    schema_version: record.schema_version,
    canvas_id: record.canvas_id,
    node_id: record.node_id,
    recorded_at: record.recorded_at,
    id: record.id,
    task_type: record.task_type,
    task_key: record.task_key,
    job_id: record.job_id,
    status: record.status,
    media_type: record.media_type,
    result: record.result,
    model: record.model,
    gen_mode: record.gen_mode,
  };
}

export const freezoneGenerationHistoryGateway: CanvasGenerationHistoryGateway = {
  async fetchNode(projectId, canvasId, nodeId, limit) {
    const data = await apiCall<{
      records?: CanvasGenerationHistoryRecord[];
    }>(
      `projects/${encodeURIComponent(projectId)}/freezone/canvases/${encodeURIComponent(
        canvasId,
      )}/nodes/${encodeURIComponent(nodeId)}/generation-history?limit=${limit}`,
    );
    return (data?.records ?? []).map(toCanvasRecord);
  },
  async fetchCanvas(projectId, canvasId, limit) {
    try {
      const data = await apiCall<{
        records?: CanvasGenerationHistoryRecord[];
      }>(
        `projects/${encodeURIComponent(projectId)}/freezone/canvases/${encodeURIComponent(
          canvasId,
        )}/generation-history?limit=${limit}`,
      );
      return (data?.records ?? []).map(toCanvasRecord);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
};
