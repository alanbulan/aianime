// Copyright (c) 2026 AI anime
import {
  sourceFromImageTo3gsResult,
  type CanvasImageTo3dSourceKind,
  type CanvasImageTo3dWorldSource,
} from "../domain/imageTo3d";
import {
  requireCanvasGenerationTaskRef,
  type CanvasGenerationTaskRef,
  type CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";
import type { CanvasImageSourcePreparationGateway } from "./prepareCanvasImageSource";

export interface CanvasImageTo3dCommand {
  readonly sourceUrl: string;
  readonly sourceKind: CanvasImageTo3dSourceKind;
  readonly canvasId: string;
  readonly nodeId: string;
}

export interface CanvasImageTo3dSubmissionGateway {
  submit(
    projectId: string,
    command: CanvasImageTo3dCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface GenerateCanvasImageTo3dParams
  extends CanvasImageTo3dCommand {
  readonly projectId: string;
}

export interface GenerateCanvasImageTo3dDependencies {
  readonly sourceGateway: CanvasImageSourcePreparationGateway;
  readonly submissionGateway: CanvasImageTo3dSubmissionGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
  readonly now: () => number;
}

export interface GenerateCanvasImageTo3dResult {
  readonly task: CanvasGenerationTaskRef;
  readonly source: CanvasImageTo3dWorldSource;
}

export async function generateCanvasImageTo3d(
  params: GenerateCanvasImageTo3dParams,
  dependencies: GenerateCanvasImageTo3dDependencies,
): Promise<GenerateCanvasImageTo3dResult> {
  const sourceUrl = await dependencies.sourceGateway.prepare(
    params.projectId,
    params.sourceUrl,
  );
  const task = requireCanvasGenerationTaskRef(
    await dependencies.submissionGateway.submit(params.projectId, {
      sourceUrl,
      sourceKind: params.sourceKind,
      canvasId: params.canvasId,
      nodeId: params.nodeId,
    }),
    "freezone_image_to_3gs",
  );
  dependencies.onTaskSubmitted(task);
  const completed = await dependencies.taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  const sourceId = `generated-sog:${params.sourceKind}:${dependencies.now()}`;
  const sourceLabel = params.sourceKind === "pano" ? "360 3DGS" : "图片 3DGS";
  let source = sourceFromImageTo3gsResult(completed.result, {
    id: sourceId,
    sourceKind: params.sourceKind,
    label: sourceLabel,
  });
  if (!source) {
    const fallbackUrl = await dependencies.taskGateway
      .fetchResultUrl(params.projectId, task.task_type, task.job_id)
      .catch(() => null);
    if (fallbackUrl) {
      source = sourceFromImageTo3gsResult(
        { output_url: fallbackUrl },
        {
          id: sourceId,
          sourceKind: params.sourceKind,
          label: sourceLabel,
        },
      );
    }
  }
  if (!source) {
    throw new Error("未能在 task.result 中找到 3D 世界地址");
  }
  return { task, source };
}
