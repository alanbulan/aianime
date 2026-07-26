// Copyright (c) 2026 AI anime
import type {
  ResolvedSkillInput,
  SkillMediaType,
  SkillOutputRole,
} from "./skillContract";

export interface SkillRunRequest {
  schema_version?: string;
  skill_node_id: string;
  canvas_id?: string;
  idempotency_key?: string;
  resolved_inputs: ResolvedSkillInput[];
  parameters?: Record<string, unknown>;
}

export interface SkillErrorEnvelope {
  code: string;
  category: string;
  message: string;
  retryable: boolean;
  user_action_hint?: string | null;
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

const DONE_STATUSES = new Set(["done", "completed", "succeeded", "success"]);
const FAILURE_STATUSES = new Set([
  "failed",
  "failure",
  "error",
  "cancelled",
  "canceled",
]);

export function isSkillRunDoneStatus(status: string): boolean {
  return DONE_STATUSES.has(status.toLowerCase());
}

export function isSkillRunFailureStatus(status: string): boolean {
  return FAILURE_STATUSES.has(status.toLowerCase());
}

export function isSkillRunTerminalStatus(status: string): boolean {
  return isSkillRunDoneStatus(status) || isSkillRunFailureStatus(status);
}

export function skillRunErrorMessage(
  error: SkillRunResult["error"],
): string | null {
  if (!error) {
    return null;
  }
  if (typeof error === "string") {
    return error;
  }
  return error.user_action_hint
    ? `${error.message} ${error.user_action_hint}`
    : error.message;
}
