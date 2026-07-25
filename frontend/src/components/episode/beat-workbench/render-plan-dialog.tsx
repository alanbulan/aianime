// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueries } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/shared/api/transport";
import { formatCreditCost } from "@/components/credits/credit-visual";
import {
  generationCreditCostQueryKey,
  type GenerationCreditCost,
} from "@/lib/queries/generation-credit-cost";
import type { OkResponse } from "@/types/api";
import {
  RenderPlanDialogView,
  type PlanEntry,
  type RenderPlan,
  useRenderExecute,
  useRenderPlan,
  useRenderSettings,
} from "@/modules/production/public";

interface RenderPlanDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: string;
  episode: number;
  beatIndices: number[];
  aspectMode: string;
  defaultForceOneByOne?: boolean;
  /**
   * Invoked after a successful execute with the per-grid `selected_regen` task
   * ids (one execute fans out into N grid tasks). Track these for completion —
   * the response's umbrella `scope` matches no task row.
   */
  onDispatched: (taskIds: string[]) => void;
}

export function RenderPlanDialog({
  open,
  onOpenChange,
  project,
  episode,
  beatIndices,
  aspectMode,
  defaultForceOneByOne = false,
  onDispatched,
}: RenderPlanDialogProps) {
  const { t } = useTranslation();
  const planMutation = useRenderPlan(project, episode);
  const executeMutation = useRenderExecute(project, episode);
  const renderSettings = useRenderSettings(project);
  const [plan, setPlan] = useState<RenderPlan | null>(null);
  const [staleBanner, setStaleBanner] = useState<"input" | "plan" | null>(null);
  const renderImageSelection = renderSettings.data?.data.render_image_selection ?? null;
  const renderCostModeKeys = useMemo(
    () => [...new Set((plan?.plan ?? []).map((entry) => entry.mode_key).filter(Boolean))],
    [plan?.plan],
  );
  const renderCostQueries = useQueries({
    queries: renderCostModeKeys.map((modeKey) => ({
      queryKey: generationCreditCostQueryKey("image_selection", renderImageSelection, {
        surface: "ai_anime",
        modeKey,
        imageRole: "render",
      }),
      queryFn: () =>
        api
          .get("api/v1/generation-credit-cost", {
            searchParams: {
              kind: "image_selection",
              surface: "ai_anime",
              value: renderImageSelection ?? "",
              mode_key: modeKey,
              image_role: "render",
            },
          })
          .json<OkResponse<GenerationCreditCost>>(),
      enabled: !!renderImageSelection,
      staleTime: 60_000,
    })),
  });

  // Fetch plan when dialog opens or force toggle changes.
  useEffect(() => {
    if (!open) return;
    setPlan(null);
    setStaleBanner(null);
    planMutation.mutate(
      {
        beatIndices,
        strategy: "location",
        aspectMode,
        forceOneByOne: defaultForceOneByOne,
      },
      {
        onSuccess: (res) => {
          if (!res.ok) {
            toast.error(res.error || t("common.error"));
            setPlan(null);
            onOpenChange(false);
            return;
          }
          if (!res.data) {
            toast.error(t("common.error"));
            setPlan(null);
            onOpenChange(false);
            return;
          }
          setPlan(res.data);
          setStaleBanner(null);
        },
        onError: async (err) => {
          const anyErr = err as {
            response?: { status?: number; json?: () => Promise<unknown> };
          };
          const status = anyErr?.response?.status;
          if (status === 400 && anyErr.response?.json) {
            const body = (await anyErr.response.json()) as {
              error?: string;
            };
            const code = body?.error ?? "unknown";
            const msg =
              code === "invalid_beats"
                ? t("episode.renderPlan.errors.invalidBeats")
                : code === "no_beats"
                  ? t("episode.renderPlan.errors.noBeats")
                  : code || t("common.error");
            toast.error(msg);
            onOpenChange(false);
            return;
          }
          if (status === 503) {
            toast.error(t("episode.renderPlan.featureDisabled"));
            onOpenChange(false);
            return;
          }
          toast.error(t("common.error"));
          onOpenChange(false);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultForceOneByOne, beatIndices, aspectMode, project, episode]);

  const handleConfirm = async () => {
    if (!plan) return;
    try {
      const res = await executeMutation.mutateAsync({
        plan: plan.plan,
        planHash: plan.plan_hash,
        inputFingerprint: plan.input_fingerprint,
        strategy: "location",
        aspectMode,
        beatIndices,
        forceOneByOne: defaultForceOneByOne,
      });
      if (!res.ok) {
        toast.error(t("common.error"));
        return;
      }
      onDispatched(res.data.task_ids ?? []);
      onOpenChange(false);
    } catch (err) {
      const anyErr = err as { response?: { status?: number; json?: () => Promise<unknown> } };
      if (anyErr?.response?.status === 409 && anyErr.response.json) {
        const body = (await anyErr.response.json()) as {
          error: "input_stale" | "plan_stale";
          data: { new_plan: PlanEntry[]; new_plan_hash: string; new_input_fingerprint: string };
        };
        setStaleBanner(body.error === "input_stale" ? "input" : "plan");
        setPlan({
          plan: body.data.new_plan,
          plan_hash: body.data.new_plan_hash,
          input_fingerprint: body.data.new_input_fingerprint,
          strategy: "location",
          total_beats: beatIndices.length,
          total_grids: body.data.new_plan.length,
        });
      } else if (anyErr?.response?.status === 503) {
        toast.error(t("episode.renderPlan.featureDisabled"));
        onOpenChange(false);
      } else {
        toast.error(t("common.error"));
      }
    }
  };

  let renderPlanCostDisplay: string | null = null;
  if (plan) {
    let complete = true;
    let totalCost = 0;
    for (const entry of plan.plan) {
      const queryIndex = renderCostModeKeys.indexOf(entry.mode_key);
      const cost = renderCostQueries[queryIndex]?.data?.data.cost;
      if (typeof cost !== "number") {
        complete = false;
        break;
      }
      totalCost += cost;
    }
    renderPlanCostDisplay = complete ? formatCreditCost(totalCost) : null;
  }

  return (
    <RenderPlanDialogView
      beatCount={beatIndices.length}
      executePending={executeMutation.isPending}
      open={open}
      plan={plan}
      planPending={planMutation.isPending}
      renderPlanCostDisplay={renderPlanCostDisplay}
      staleBanner={staleBanner}
      onConfirm={() => void handleConfirm()}
      onOpenChange={onOpenChange}
    />
  );
}
