// Copyright (c) 2026 AI anime
import {
  buildCanvasRelightPrompt,
  resolveCanvasRelightKeyLightDirection,
  type CanvasRelightKeyLightDirection,
  type CanvasRelightSmartPrompt,
} from "../domain/relight";
import { completeCanvasMediaGenerationTask } from "./completeCanvasMediaGenerationTask";
import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./ports";

export interface CanvasRelightGenerationCommand {
  readonly sourceUrl: string;
  readonly lightingReferenceUrl: null;
  readonly scope: "global";
  readonly smartMode: boolean;
  readonly brightness: number;
  readonly colorHex: string;
  readonly colorTemperatureKelvin: number;
  readonly keyLightDirection: CanvasRelightKeyLightDirection;
  readonly rimLight: boolean;
  readonly prompt: string;
  readonly imageSize: string;
  readonly model: string;
}

export interface CanvasRelightGenerationGateway {
  submit(
    projectId: string,
    command: CanvasRelightGenerationCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface GenerateCanvasRelightParams {
  readonly projectId: string;
  readonly sourceUrl: string;
  readonly brightness: number;
  readonly colorHex: string;
  readonly colorTemperatureKelvin: number;
  readonly keyLightCandidate: string | null;
  readonly rimLight: boolean;
  readonly smartMode: CanvasRelightSmartPrompt;
  readonly imageSize: string;
  readonly model: string;
}

export interface GenerateCanvasRelightDependencies {
  readonly submissionGateway: CanvasRelightGenerationGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasRelightResult {
  readonly task: CanvasGenerationTaskRef;
  readonly url: string;
}

export async function generateCanvasRelight(
  params: GenerateCanvasRelightParams,
  dependencies: GenerateCanvasRelightDependencies,
): Promise<GenerateCanvasRelightResult> {
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    sourceUrl: params.sourceUrl.split("?")[0],
    lightingReferenceUrl: null,
    scope: "global",
    smartMode: params.smartMode.enabled,
    brightness: params.brightness,
    colorHex: params.colorHex,
    colorTemperatureKelvin: params.colorTemperatureKelvin,
    keyLightDirection: resolveCanvasRelightKeyLightDirection(
      params.keyLightCandidate,
    ),
    rimLight: params.rimLight,
    prompt: buildCanvasRelightPrompt(params.smartMode),
    imageSize: params.imageSize,
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
