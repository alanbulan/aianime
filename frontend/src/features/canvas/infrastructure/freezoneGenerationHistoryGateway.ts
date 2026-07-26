// Copyright (c) 2026 AI anime
import {
  fetchCanvasGenerationHistory,
  fetchNodeGenerationHistory,
  type FreezoneGenerationHistoryRecord,
} from "@/api/ops";
import { ApiError } from "@/shared/api/errors";

import type {
  CanvasGenerationHistoryGateway,
  CanvasGenerationHistoryRecord,
} from "../application/generationHistory";

function toCanvasRecord(
  record: FreezoneGenerationHistoryRecord,
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
    const records = await fetchNodeGenerationHistory(
      projectId,
      canvasId,
      nodeId,
      limit,
    );
    return records.map(toCanvasRecord);
  },
  async fetchCanvas(projectId, canvasId, limit) {
    try {
      const records = await fetchCanvasGenerationHistory(
        projectId,
        canvasId,
        limit,
      );
      return records.map(toCanvasRecord);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
};
