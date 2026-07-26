// Copyright (c) 2026 AI anime
import { sourceFromImageTo3gsResult } from "../domain/directorWorldSources";
import type { CanvasImageTo3dSourceKind } from "../domain/imageTo3d";
import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./ports";

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
  readonly submissionGateway: CanvasImageTo3dSubmissionGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
  readonly now: () => number;
}

export async function generateCanvasImageTo3d(
  params: GenerateCanvasImageTo3dParams,
  dependencies: GenerateCanvasImageTo3dDependencies,
) {
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    sourceUrl: params.sourceUrl,
    sourceKind: params.sourceKind,
    canvasId: params.canvasId,
    nodeId: params.nodeId,
  });
  dependencies.onTaskSubmitted(task);
  const completed = await dependencies.taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  const source = sourceFromImageTo3gsResult(completed.result, {
    id: `generated-sog:${params.sourceKind}:${dependencies.now()}`,
    sourceKind: params.sourceKind,
    label: params.sourceKind === "pano" ? "360 3DGS" : "图片 3DGS",
  });
  if (!source) {
    throw new Error("未能在 task.result 中找到 3D 世界地址");
  }
  return { task, source };
}
