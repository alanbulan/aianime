// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { header?: string }) => (
      values?.header ? `${key}:${values.header}` : key
    ),
  }),
}));

import type { DecisionRequest } from "@/modules/ai_assistant/domain/contracts";
import { DecisionCard } from "./DecisionCard";

const decision: DecisionRequest = {
  id: "decision-1",
  title: "完整生产启动前确认",
  source: "workflow_preflight",
  status: "pending",
  questions: [
    {
      id: "resolution",
      header: "成片画质",
      question: "视频分辨率采用哪种策略？",
      options: [
        {
          id: "provider_default",
          label: "按模型能力自动选择",
          description: "避免模型与分辨率冲突。",
        },
        { id: "1080p", label: "1080p", description: "高清成片。" },
      ],
      recommended_option_id: "provider_default",
      allow_custom: true,
    },
    {
      id: "subtitles",
      header: "字幕",
      question: "是否添加字幕？",
      options: [
        { id: "yes", label: "添加字幕", description: "提升可读性。" },
        { id: "no", label: "不添加", description: "保留纯画面。" },
      ],
      recommended_option_id: "yes",
    },
  ],
};

describe("SuperChat decision card", () => {
  it("requires every question and submits structured option answers", () => {
    const onSubmit = vi.fn();
    render(
      <DecisionCard decision={decision} submitting={false} onSubmit={onSubmit} />,
    );

    const submit = screen.getByRole("button", {
      name: "aiAssistant.decisionConfirm",
    });
    expect(submit).toBeDisabled();
    expect(screen.getAllByText("aiAssistant.decisionRecommended")).toHaveLength(2);

    fireEvent.click(screen.getByRole("radio", { name: /1080p/ }));
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /添加字幕/ }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith([
      { question_id: "resolution", option_id: "1080p" },
      { question_id: "subtitles", option_id: "yes" },
    ]);
  });

  it("accepts a non-empty custom answer and locks controls while submitting", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <DecisionCard decision={decision} submitting={false} onSubmit={onSubmit} />,
    );

    fireEvent.click(screen.getByRole("radio", {
      name: "aiAssistant.decisionCustom",
    }));
    fireEvent.change(screen.getByRole("textbox", {
      name: "aiAssistant.decisionCustomFor:成片画质",
    }), { target: { value: "  768p  " } });
    fireEvent.click(screen.getByRole("radio", { name: /不添加/ }));
    fireEvent.click(screen.getByRole("button", {
      name: "aiAssistant.decisionConfirm",
    }));

    expect(onSubmit).toHaveBeenCalledWith([
      { question_id: "resolution", custom_text: "768p" },
      { question_id: "subtitles", option_id: "no" },
    ]);

    rerender(
      <DecisionCard decision={decision} submitting onSubmit={onSubmit} />,
    );
    expect(screen.getByRole("button", {
      name: "aiAssistant.decisionSubmitting",
    })).toBeDisabled();
  });
});
