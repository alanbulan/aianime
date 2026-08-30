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

export const IMAGE_QUALITY_MODEL_IDS = [
  "lingshan-g2",
  "gpt-image-2",
  "image-2",
  "image-2-official",
] as const;

const IMAGE_QUALITY_MODEL_ID_SET = new Set<string>(IMAGE_QUALITY_MODEL_IDS);

export function imageModelSupportsQuality(model: string | null | undefined): boolean {
  const normalized = String(model ?? "").trim().toLowerCase();
  return (
    IMAGE_QUALITY_MODEL_ID_SET.has(normalized)
    || normalized.includes("gpt-image")
  );
}

export interface GenerationCreditCostResponse {
  ok: true;
  data: GenerationCreditCost;
}
