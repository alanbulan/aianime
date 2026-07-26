// Copyright (c) 2026 AI anime
import { apiRequest } from "@/shared/api/client";
import type {
  ResolvedSkillInput,
  SkillMediaType,
  SkillOutputRole,
} from "@/features/freezone/public";

export interface SkillRunRequest {
  schema_version?: string;
  skill_node_id: string;
  canvas_id?: string;
  idempotency_key?: string;
  resolved_inputs: ResolvedSkillInput[];
  parameters?: Record<string, unknown>;
}

export interface SkillRunResponse {
  schema_version?: string;
  run_id: string;
  status: string;
  task_key?: string | null;
  task_type?: string | null;
  job_id?: string | null;
  error?: SkillErrorEnvelope | null;
}

export interface SkillErrorEnvelope {
  code: string;
  category: string;
  message: string;
  retryable: boolean;
  user_action_hint?: string | null;
}

export interface SkillRunOutput {
  schema_version?: string;
  role: SkillOutputRole;
  media_type: SkillMediaType;
  node_type: string;
  pushable: boolean;
  image_url?: string | null;
  text?: string | null;
  json_value?: unknown;
  graph_patch?: CanvasGraphPatch | null;
  slot_target?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface CanvasGraphPatchOperation {
  op:
    | "add_node"
    | "update_node"
    | "delete_node"
    | "add_edge"
    | "update_edge"
    | "delete_edge";
  node?: Record<string, unknown> | null;
  edge?: Record<string, unknown> | null;
  node_id?: string | null;
  edge_id?: string | null;
  data?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface CanvasGraphPatch {
  schema_version: "graph_patch.v1" | string;
  operations: CanvasGraphPatchOperation[];
  requires_apply: boolean;
  summary?: string | null;
}

export interface SkillRunResult {
  schema_version?: string;
  run_id: string;
  status: string;
  outputs: SkillRunOutput[];
  task_key?: string | null;
  task_type?: string | null;
  job_id?: string | null;
  error?: SkillErrorEnvelope | string | null;
}

export async function runSkill(
  project: string,
  skillId: string,
  request: SkillRunRequest,
): Promise<SkillRunResponse> {
  return await apiRequest(
    `projects/${encodeURIComponent(project)}/freezone/skills/${encodeURIComponent(skillId)}/run`,
    { method: "POST", json: request },
  ).json<SkillRunResponse>();
}

export async function getSkillRunResult(
  project: string,
  runId: string,
): Promise<SkillRunResult> {
  return await apiRequest(
    `projects/${encodeURIComponent(project)}/freezone/skills/runs/${encodeURIComponent(runId)}/result`,
  ).json<SkillRunResult>();
}
