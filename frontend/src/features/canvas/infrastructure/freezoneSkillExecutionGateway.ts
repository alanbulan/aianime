// Copyright (c) 2026 AI anime
import { apiRequest } from "@/shared/api/client";
import type {
  SkillRunResponse,
  SkillRunResult,
} from "@/modules/creative_canvas/public";

import type { CanvasSkillExecutionGateway } from "../application/skillExecution";

export const freezoneSkillExecutionGateway: CanvasSkillExecutionGateway = {
  async startRun(projectId, skillId, request) {
    return await apiRequest(
      `projects/${encodeURIComponent(projectId)}/freezone/skills/${encodeURIComponent(skillId)}/run`,
      { method: "POST", json: request },
    ).json<SkillRunResponse>();
  },
  async getRunResult(projectId, runId) {
    return await apiRequest(
      `projects/${encodeURIComponent(projectId)}/freezone/skills/runs/${encodeURIComponent(runId)}/result`,
    ).json<SkillRunResult>();
  },
};
