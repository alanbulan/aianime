// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type {
  ProductionDataResponse,
  ProductionErrorResponse,
} from "@/modules/production/application/ports";
import type { RenderSettingsData } from "@/modules/production/domain/image-settings";
import type {
  CreateRenderPlanCommand,
  ExecuteRenderPlanCommand,
  PlanEntry,
  RenderExecuteResult,
  RenderPlan,
} from "@/modules/production/domain/render-plan";

type RenderPlanResponse =
  | ProductionDataResponse<RenderPlan>
  | ProductionErrorResponse;
type RenderExecuteResponse =
  | ProductionDataResponse<RenderExecuteResult>
  | ProductionErrorResponse;

interface RenderPlanMutation {
  isPending: boolean;
  mutate(
    command: CreateRenderPlanCommand,
    options?: {
      onSuccess?(response: RenderPlanResponse): void;
      onError?(error: unknown): void;
    },
  ): void;
}

interface RenderExecuteMutation {
  isPending: boolean;
  mutateAsync(command: ExecuteRenderPlanCommand): Promise<RenderExecuteResponse>;
}

interface RenderSettingsQuery {
  data?: ProductionDataResponse<RenderSettingsData>;
}

interface CreditCostQuery {
  data?: { data: { cost: number } };
}

export interface RenderPlanCreditCostRequest {
  kind: "image_selection";
  value: string | null;
  options: {
    imageRole: "render";
    modeKey: string;
    surface: "ai_anime";
  };
}

export interface RenderPlanDialogControllerQueries {
  useRenderExecute(project: string, episode: number): RenderExecuteMutation;
  useRenderPlan(project: string, episode: number): RenderPlanMutation;
  useRenderSettings(project: string): RenderSettingsQuery;
}

export interface RenderPlanDialogControllerDependencies {
  formatCreditCost(cost: number): string;
  useGenerationCreditCosts(
    requests: readonly RenderPlanCreditCostRequest[],
  ): readonly CreditCostQuery[];
}

export interface RenderPlanDialogControllerOptions {
  open: boolean;
  onOpenChange(open: boolean): void;
  project: string;
  episode: number;
  beatIndices: number[];
  aspectMode: string;
  defaultForceOneByOne?: boolean;
  onDispatched(taskIds: string[]): void;
}

export type RenderPlanStaleBanner = "input" | "plan" | null;

export interface RenderPlanDialogController {
  beatCount: number;
  executePending: boolean;
  open: boolean;
  plan: RenderPlan | null;
  planPending: boolean;
  renderPlanCostDisplay: string | null;
  staleBanner: RenderPlanStaleBanner;
  onConfirm(): void;
  onOpenChange(open: boolean): void;
}

export function createUseRenderPlanDialogController(
  queries: RenderPlanDialogControllerQueries,
  dependencies: RenderPlanDialogControllerDependencies,
) {
  return function useRenderPlanDialogController({
    open,
    onOpenChange,
    project,
    episode,
    beatIndices,
    aspectMode,
    defaultForceOneByOne = false,
    onDispatched,
  }: RenderPlanDialogControllerOptions): RenderPlanDialogController {
    const { t } = useTranslation();
    const planMutation = queries.useRenderPlan(project, episode);
    const executeMutation = queries.useRenderExecute(project, episode);
    const renderSettings = queries.useRenderSettings(project);
    const [plan, setPlan] = useState<RenderPlan | null>(null);
    const [staleBanner, setStaleBanner] =
      useState<RenderPlanStaleBanner>(null);
    const renderImageSelection =
      renderSettings.data?.data.render_image_selection ?? null;
    const renderCostModeKeys = useMemo(
      () => [
        ...new Set(
          (plan?.plan ?? []).map((entry) => entry.mode_key).filter(Boolean),
        ),
      ],
      [plan?.plan],
    );
    const renderCostRequests = useMemo<RenderPlanCreditCostRequest[]>(
      () =>
        renderCostModeKeys.map((modeKey) => ({
          kind: "image_selection",
          value: renderImageSelection,
          options: {
            surface: "ai_anime",
            modeKey,
            imageRole: "render",
          },
        })),
      [renderCostModeKeys, renderImageSelection],
    );
    const renderCostQueries =
      dependencies.useGenerationCreditCosts(renderCostRequests);

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
          onSuccess: (response) => {
            if (!response.ok) {
              toast.error(response.error || t("common.error"));
              setPlan(null);
              onOpenChange(false);
              return;
            }
            if (!response.data) {
              toast.error(t("common.error"));
              setPlan(null);
              onOpenChange(false);
              return;
            }
            setPlan(response.data);
            setStaleBanner(null);
          },
          onError: async (error) => {
            const responseError = error as {
              response?: { status?: number; json?: () => Promise<unknown> };
            };
            const status = responseError.response?.status;
            if (status === 400 && responseError.response?.json) {
              const body = (await responseError.response.json()) as {
                error?: string;
              };
              const code = body.error ?? "unknown";
              const message =
                code === "invalid_beats"
                  ? t("episode.renderPlan.errors.invalidBeats")
                  : code === "no_beats"
                    ? t("episode.renderPlan.errors.noBeats")
                    : code || t("common.error");
              toast.error(message);
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
    }, [
      open,
      defaultForceOneByOne,
      beatIndices,
      aspectMode,
      project,
      episode,
    ]);

    const confirm = async () => {
      if (!plan) return;
      try {
        const response = await executeMutation.mutateAsync({
          plan: plan.plan,
          planHash: plan.plan_hash,
          inputFingerprint: plan.input_fingerprint,
          strategy: "location",
          aspectMode,
          beatIndices,
          forceOneByOne: defaultForceOneByOne,
        });
        if (!response.ok) {
          toast.error(t("common.error"));
          return;
        }
        onDispatched(response.data.task_ids ?? []);
        onOpenChange(false);
      } catch (error) {
        const responseError = error as {
          response?: { status?: number; json?: () => Promise<unknown> };
        };
        if (
          responseError.response?.status === 409 &&
          responseError.response.json
        ) {
          const body = (await responseError.response.json()) as {
            error: "input_stale" | "plan_stale";
            data: {
              new_plan: PlanEntry[];
              new_plan_hash: string;
              new_input_fingerprint: string;
            };
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
        } else if (responseError.response?.status === 503) {
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
      renderPlanCostDisplay = complete
        ? dependencies.formatCreditCost(totalCost)
        : null;
    }

    return {
      beatCount: beatIndices.length,
      executePending: executeMutation.isPending,
      open,
      plan,
      planPending: planMutation.isPending,
      renderPlanCostDisplay,
      staleBanner,
      onConfirm: () => {
        void confirm();
      },
      onOpenChange,
    };
  };
}
