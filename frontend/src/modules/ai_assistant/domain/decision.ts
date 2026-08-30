// Copyright (c) 2026 AI anime
import type {
  DecisionOption,
  DecisionQuestion,
  DecisionRequest,
} from "@/modules/ai_assistant/domain/contracts";

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOption(value: unknown): DecisionOption | null {
  const raw = objectValue(value);
  if (!raw) return null;
  const id = nonEmptyText(raw.id);
  const label = nonEmptyText(raw.label);
  if (!id || !label) return null;
  return {
    id,
    label,
    description: typeof raw.description === "string"
      ? raw.description.trim()
      : "",
  };
}

function normalizeQuestion(value: unknown): DecisionQuestion | null {
  const raw = objectValue(value);
  if (!raw) return null;
  const id = nonEmptyText(raw.id);
  const header = nonEmptyText(raw.header);
  const question = nonEmptyText(raw.question);
  const options = Array.isArray(raw.options)
    ? raw.options.map(normalizeOption).filter((item): item is DecisionOption => Boolean(item))
    : [];
  if (!id || !header || !question || options.length < 2 || options.length > 3) {
    return null;
  }
  const recommendedOptionId = nonEmptyText(raw.recommended_option_id);
  return {
    id,
    header,
    question,
    options,
    recommended_option_id: recommendedOptionId
      && options.some((option) => option.id === recommendedOptionId)
      ? recommendedOptionId
      : options[0]?.id,
    allow_custom: raw.allow_custom === true,
  };
}

export function normalizeDecision(value: unknown): DecisionRequest | null {
  const raw = objectValue(value);
  if (!raw) return null;
  const id = nonEmptyText(raw.id);
  const title = nonEmptyText(raw.title);
  const questions = Array.isArray(raw.questions)
    ? raw.questions
      .map(normalizeQuestion)
      .filter((item): item is DecisionQuestion => Boolean(item))
    : [];
  if (!id || !title || questions.length < 1) {
    return null;
  }
  return {
    id,
    title,
    source: nonEmptyText(raw.source) ?? "question",
    status: "pending",
    turn_id: nonEmptyText(raw.turn_id) ?? undefined,
    questions,
    created_at: nonEmptyText(raw.created_at) ?? undefined,
  };
}

export function normalizeDecisions(value: unknown): DecisionRequest[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, DecisionRequest>();
  value.forEach((item) => {
    const decision = normalizeDecision(item);
    if (decision) byId.set(decision.id, decision);
  });
  return [...byId.values()];
}
