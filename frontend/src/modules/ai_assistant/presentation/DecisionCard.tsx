// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";
import { CircleHelp, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  DecisionAnswer,
  DecisionRequest,
} from "@/modules/ai_assistant/domain/contracts";

type QuestionSelection =
  | { kind: "option"; optionId: string }
  | { kind: "custom" };

export function DecisionCard({
  decision,
  submitting,
  onSubmit,
}: {
  decision: DecisionRequest;
  submitting: boolean;
  onSubmit: (answers: DecisionAnswer[]) => void | Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [selections, setSelections] = useState<Record<string, QuestionSelection>>({});
  const [customText, setCustomText] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelections({});
    setCustomText({});
  }, [decision.id]);

  const answers = useMemo<DecisionAnswer[] | null>(() => {
    const resolved: DecisionAnswer[] = [];
    for (const question of decision.questions) {
      const selection = selections[question.id];
      if (!selection) return null;
      if (selection.kind === "option") {
        resolved.push({
          question_id: question.id,
          option_id: selection.optionId,
        });
        continue;
      }
      const text = (customText[question.id] ?? "").trim();
      if (!text) return null;
      resolved.push({
        question_id: question.id,
        custom_text: text,
      });
    }
    return resolved;
  }, [customText, decision.questions, selections]);

  return (
    <section
      className="border-b border-primary/20 bg-primary/5 px-3 py-3"
      aria-labelledby={`decision-title-${decision.id}`}
    >
      <div className="mb-3 flex items-start gap-2">
        <CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h3
            id={`decision-title-${decision.id}`}
            className="text-sm font-medium text-foreground"
          >
            {decision.title}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("aiAssistant.decisionPauseHint")}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {decision.questions.map((question) => {
          const selection = selections[question.id];
          return (
            <fieldset key={question.id} disabled={submitting}>
              <legend className="mb-1 text-xs font-medium text-foreground">
                {question.header}
              </legend>
              <p className="mb-2 text-xs leading-5 text-muted-foreground">
                {question.question}
              </p>
              <div
                className="grid gap-2"
                role="radiogroup"
                aria-label={question.question}
              >
                {question.options.map((option) => {
                  const selected = selection?.kind === "option"
                    && selection.optionId === option.id;
                  const recommended = option.id === question.recommended_option_id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={[
                        "rounded-lg border px-3 py-2 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:border-primary/50",
                      ].join(" ")}
                      onClick={() => setSelections((current) => ({
                        ...current,
                        [question.id]: { kind: "option", optionId: option.id },
                      }))}
                    >
                      <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                        {option.label}
                        {recommended && (
                          <Badge variant="secondary" className="rounded px-1.5 py-0 text-[10px]">
                            {t("aiAssistant.decisionRecommended")}
                          </Badge>
                        )}
                      </span>
                      {option.description && (
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </button>
                  );
                })}

                {question.allow_custom && (
                  <div
                    className={[
                      "rounded-lg border px-3 py-2",
                      selection?.kind === "custom"
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selection?.kind === "custom"}
                      className="text-xs font-medium text-foreground"
                      onClick={() => setSelections((current) => ({
                        ...current,
                        [question.id]: { kind: "custom" },
                      }))}
                    >
                      {t("aiAssistant.decisionCustom")}
                    </button>
                    {selection?.kind === "custom" && (
                      <Input
                        className="mt-2 h-8 text-xs"
                        aria-label={t("aiAssistant.decisionCustomFor", {
                          header: question.header,
                        })}
                        value={customText[question.id] ?? ""}
                        maxLength={500}
                        autoFocus
                        onChange={(event) => setCustomText((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))}
                      />
                    )}
                  </div>
                )}
              </div>
            </fieldset>
          );
        })}
      </div>

      <Button
        className="mt-4 w-full"
        size="sm"
        disabled={!answers || submitting}
        onClick={() => {
          if (answers) void onSubmit(answers);
        }}
      >
        {submitting && <Loader2 className="size-3.5 animate-spin" />}
        {submitting
          ? t("aiAssistant.decisionSubmitting")
          : t("aiAssistant.decisionConfirm")}
      </Button>
    </section>
  );
}
