// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { normalizeDecision } from "./decision";

describe("decision normalization", () => {
  it("keeps every valid question when a decision contains more than three", () => {
    const questions = Array.from({ length: 5 }, (_, index) => ({
      id: `choice_${index + 1}`,
      header: `参数${index + 1}`,
      question: `请选择参数 ${index + 1}`,
      options: [
        { id: "recommended", label: "推荐值" },
        { id: "alternative", label: "备选值" },
      ],
      recommended_option_id: "recommended",
    }));

    const decision = normalizeDecision({
      id: "decision-many",
      title: "完整生产启动前确认",
      questions,
    });

    expect(decision?.questions).toHaveLength(5);
  });
});
