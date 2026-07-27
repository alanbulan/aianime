export type GenerationCreditCost = {
  cost: number;
  display: string;
  unit?: "call" | "item" | "second" | "token" | "character" | string;
  unit_cost?: number;
  quantity?: number;
  params?: Record<string, unknown>;
};

export type GenerationCreditCostOptions = {
  surface?: "ai_anime" | "canvas" | null;
  params?: Record<string, unknown> | null;
  quantity?: number | null;
  modeKey?: string | null;
  imageRole?: string | null;
};

export interface GenerationCreditCostRequest {
  kind: string;
  value?: string | null;
  options?: GenerationCreditCostOptions;
}

export interface GenerationCreditCostResponse {
  ok: true;
  data: GenerationCreditCost;
}
