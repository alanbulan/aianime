// Copyright (c) 2026 AI anime
import {
  isSkillRunTerminalStatus,
  type SkillRunRequest,
  type SkillRunResponse,
  type SkillRunResult,
} from "@/features/freezone/public";

const DEFAULT_RESULT_POLL_DELAY_MS = 700;
const DEFAULT_RESULT_POLL_ATTEMPTS = 30;

export interface CanvasSkillExecutionGateway {
  startRun: (
    projectId: string,
    skillId: string,
    request: SkillRunRequest,
  ) => Promise<SkillRunResponse>;
  getRunResult: (
    projectId: string,
    runId: string,
  ) => Promise<SkillRunResult>;
}

export interface StartCanvasSkillRunParams {
  projectId: string;
  skillId: string;
  request: SkillRunRequest;
}

export function startCanvasSkillRun(
  params: StartCanvasSkillRunParams,
  gateway: CanvasSkillExecutionGateway,
): Promise<SkillRunResponse> {
  return gateway.startRun(params.projectId, params.skillId, params.request);
}

export interface AwaitCanvasSkillRunResultParams {
  projectId: string;
  runId: string;
  maxAttempts?: number;
  pollDelayMs?: number;
}

export interface AwaitCanvasSkillRunResultDependencies {
  gateway: CanvasSkillExecutionGateway;
  sleep: (delayMs: number) => Promise<void>;
}

export async function awaitCanvasSkillRunResult(
  params: AwaitCanvasSkillRunResultParams,
  dependencies: AwaitCanvasSkillRunResultDependencies,
): Promise<SkillRunResult> {
  const maxAttempts = params.maxAttempts ?? DEFAULT_RESULT_POLL_ATTEMPTS;
  const pollDelayMs = params.pollDelayMs ?? DEFAULT_RESULT_POLL_DELAY_MS;
  let latest: SkillRunResult | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    latest = await dependencies.gateway.getRunResult(
      params.projectId,
      params.runId,
    );
    if (isSkillRunTerminalStatus(latest.status)) {
      return latest;
    }
    await dependencies.sleep(pollDelayMs);
  }

  throw new Error(
    `Skill run ${params.runId} did not finish; latest status: ${latest?.status ?? "unknown"}`,
  );
}
