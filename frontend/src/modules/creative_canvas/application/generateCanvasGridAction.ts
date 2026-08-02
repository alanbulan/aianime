// Copyright (c) 2026 AI anime
import {
  resolveGridActionTemplateMode,
  type CanvasTemplateEditMode,
  type GridActionKey,
} from "../domain/gridAction";
import {
  completeCanvasMediaGenerationTask,
  type CanvasGenerationTaskRef,
  type CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";
import type { CanvasImageSourcePreparationGateway } from "./prepareCanvasImageSource";

export interface CanvasGridActionGenerationCommand {
  readonly sourceUrl: string;
  readonly mode: CanvasTemplateEditMode;
  readonly prompt: string;
  readonly model: string;
}

export interface CanvasGridActionGenerationGateway {
  submit(
    projectId: string,
    command: CanvasGridActionGenerationCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface GenerateCanvasGridActionParams {
  readonly projectId: string;
  readonly sourceUrl: string;
  readonly actionKey: GridActionKey;
  readonly prompt: string;
  readonly model: string;
}

export interface GenerateCanvasGridActionDependencies {
  readonly sourceGateway: CanvasImageSourcePreparationGateway;
  readonly submissionGateway: CanvasGridActionGenerationGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasGridActionResult {
  readonly task: CanvasGenerationTaskRef;
  readonly url: string;
}

export async function generateCanvasGridAction(
  params: GenerateCanvasGridActionParams,
  dependencies: GenerateCanvasGridActionDependencies,
): Promise<GenerateCanvasGridActionResult> {
  const sourceUrl = await dependencies.sourceGateway.prepare(
    params.projectId,
    params.sourceUrl,
  );
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    sourceUrl,
    mode: resolveGridActionTemplateMode(params.actionKey),
    prompt: params.prompt,
    model: params.model,
  });
  const url = await completeCanvasMediaGenerationTask(
    { projectId: params.projectId, task },
    {
      taskGateway: dependencies.taskGateway,
      onTaskSubmitted: dependencies.onTaskSubmitted,
    },
  );
  return { task, url };
}
