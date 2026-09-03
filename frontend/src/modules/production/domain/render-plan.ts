// Copyright (c) 2026 AI anime

export interface PlanEntry {
  mode_key: string;
  rows: number;
  cols: number;
  beat_numbers: number[];
  location: string;
  padding_count: number;
  reasons: string[];
  warnings: string[];
}

export interface RenderPlan {
  plan: PlanEntry[];
  plan_hash: string;
  input_fingerprint: string;
  strategy: "location";
  total_beats: number;
  total_grids: number;
}

export interface RenderExecuteResult {
  task_type: "render_plan";
  message: string;
  scope: string;
  resolved_grids: PlanEntry[];
  task_ids: string[];
}

export interface CreateRenderPlanCommand {
  beatIndices: number[];
  strategy: "location";
  forceOneByOne?: boolean;
  aspectMode: string;
  imageGenerationSelection?: string;
}

export interface ExecuteRenderPlanCommand {
  plan: PlanEntry[];
  planHash: string;
  inputFingerprint: string;
  strategy: "location";
  aspectMode: string;
  forceOneByOne?: boolean;
  imageGenerationSelection?: string;
  sketchAspectPadding?: boolean;
  customPlan?: boolean;
  beatIndices: number[];
}
