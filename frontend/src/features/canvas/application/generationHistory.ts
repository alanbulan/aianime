// Copyright (c) 2026 AI anime
export interface CanvasGenerationHistoryRecord {
  readonly schema_version: number;
  readonly canvas_id: string;
  readonly node_id: string;
  readonly recorded_at: string;
  readonly id: string;
  readonly task_type: string;
  readonly task_key: string;
  readonly job_id: string;
  readonly status: string;
  readonly media_type: string;
  readonly result: Record<string, unknown>;
  readonly model?: string;
  readonly gen_mode?: string;
}

export interface CanvasGenerationHistoryGateway {
  fetchNode(
    projectId: string,
    canvasId: string,
    nodeId: string,
    limit: number,
  ): Promise<CanvasGenerationHistoryRecord[]>;
  /** Returns null only when the aggregate endpoint is unavailable. */
  fetchCanvas(
    projectId: string,
    canvasId: string,
    limit: number,
  ): Promise<CanvasGenerationHistoryRecord[] | null>;
}

export interface GetNodeGenerationHistoryParams {
  readonly projectId: string;
  readonly canvasId: string;
  readonly nodeId: string;
  readonly limit?: number;
}

export interface GetCanvasGenerationHistoryParams {
  readonly projectId: string;
  readonly canvasId: string;
  readonly fallbackNodeIds: ReadonlyArray<string>;
  readonly limit?: number;
}

const NODE_HISTORY_LIMIT = 100;
const CANVAS_HISTORY_LIMIT = 500;
const FALLBACK_CONCURRENCY = 6;

function sortNewestFirst(
  records: CanvasGenerationHistoryRecord[],
): CanvasGenerationHistoryRecord[] {
  return [...records].sort(
    (left, right) =>
      new Date(right.recorded_at).getTime() -
      new Date(left.recorded_at).getTime(),
  );
}

async function fetchFallbackHistory(
  params: GetCanvasGenerationHistoryParams,
  gateway: CanvasGenerationHistoryGateway,
): Promise<CanvasGenerationHistoryRecord[]> {
  const records: CanvasGenerationHistoryRecord[] = [];
  for (
    let index = 0;
    index < params.fallbackNodeIds.length;
    index += FALLBACK_CONCURRENCY
  ) {
    const nodeIds = params.fallbackNodeIds.slice(
      index,
      index + FALLBACK_CONCURRENCY,
    );
    const batches = await Promise.all(
      nodeIds.map((nodeId) =>
        gateway
          .fetchNode(
            params.projectId,
            params.canvasId,
            nodeId,
            NODE_HISTORY_LIMIT,
          )
          .catch(() => []),
      ),
    );
    for (const batch of batches) records.push(...batch);
  }
  const seen = new Set<string>();
  return sortNewestFirst(
    records.filter((record) => {
      if (seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    }),
  );
}

export function queryNodeGenerationHistory(
  params: GetNodeGenerationHistoryParams,
  gateway: CanvasGenerationHistoryGateway,
) {
  return gateway.fetchNode(
    params.projectId,
    params.canvasId,
    params.nodeId,
    params.limit ?? NODE_HISTORY_LIMIT,
  );
}

export async function queryCanvasGenerationHistory(
  params: GetCanvasGenerationHistoryParams,
  gateway: CanvasGenerationHistoryGateway,
): Promise<CanvasGenerationHistoryRecord[]> {
  const aggregate = await gateway.fetchCanvas(
    params.projectId,
    params.canvasId,
    params.limit ?? CANVAS_HISTORY_LIMIT,
  );
  if (aggregate !== null) return aggregate;
  return await fetchFallbackHistory(params, gateway);
}
