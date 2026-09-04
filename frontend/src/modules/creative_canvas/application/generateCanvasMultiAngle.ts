// Copyright (c) 2026 AI anime
import {
  normalizeMultiAngleYaw,
  resolveMultiAngleGenerationPreset,
  type CanvasMultiViewPreset,
  type MultiAngleImageSize,
  type MultiAnglePresetKey,
  type MultiAngleZoomLevel,
} from "../domain/multiAngle";
import {
  completeCanvasMediaGenerationTask,
  type CanvasGenerationTaskRef,
  type CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";

export interface CanvasMultiAngleGenerationCommand {
  readonly sourceUrl: string;
  readonly preset: CanvasMultiViewPreset;
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly shotSize: MultiAngleZoomLevel;
  readonly prompt: string;
  readonly model: string;
  readonly modelSelector?: string;
  readonly imageSize: MultiAngleImageSize;
}

export interface CanvasMultiAngleGenerationGateway {
  submit(
    projectId: string,
    command: CanvasMultiAngleGenerationCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface GenerateCanvasMultiAngleParams {
  readonly projectId: string;
  readonly sourceUrl: string;
  readonly preset: MultiAnglePresetKey;
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly shotSize: MultiAngleZoomLevel;
  readonly promptOverride: string | null;
  readonly model: string;
  readonly modelSelector?: string;
  readonly imageSize: MultiAngleImageSize;
}

export interface GenerateCanvasMultiAngleDependencies {
  readonly submissionGateway: CanvasMultiAngleGenerationGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasMultiAngleResult {
  readonly task: CanvasGenerationTaskRef;
  readonly url: string;
}

export async function generateCanvasMultiAngle(
  params: GenerateCanvasMultiAngleParams,
  dependencies: GenerateCanvasMultiAngleDependencies,
): Promise<GenerateCanvasMultiAngleResult> {
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    sourceUrl: params.sourceUrl.split("?")[0],
    preset: resolveMultiAngleGenerationPreset(params.preset),
    yawDegrees: normalizeMultiAngleYaw(params.yawDegrees),
    pitchDegrees: params.pitchDegrees,
    shotSize: params.shotSize,
    prompt: params.promptOverride ?? "",
    model: params.model,
    modelSelector: params.modelSelector,
    imageSize: params.imageSize,
  });
  const url = await completeCanvasMediaGenerationTask(
    { projectId: params.projectId, task, media: "image" },
    {
      taskGateway: dependencies.taskGateway,
      onTaskSubmitted: dependencies.onTaskSubmitted,
    },
  );
  return { task, url };
}
