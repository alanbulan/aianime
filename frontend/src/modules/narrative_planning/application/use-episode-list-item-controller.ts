// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useStageTask } from "@/modules/task_execution/public";
import { useTaskController } from "@/modules/task_execution/public";
import { queryKeys } from "@/lib/query-keys";
import { TASK_TYPES } from "@/modules/task_execution/public";
import {
  isPlanEpisodeAssetsResult,
  type NarrativePlanningQueryHooks,
} from "@/modules/narrative_planning/application/query-hooks";
import type { Episode } from "@/modules/narrative_planning/domain/types";
import { backendErrorToastMessage } from "@/shared/api/errors";

export interface EpisodeListItemControllerOptions {
  project: string;
  episode: Episode;
  onSelect(): void;
}

export function createUseEpisodeListItemController(
  queries: NarrativePlanningQueryHooks,
) {
  return function useEpisodeListItemController(
    options: EpisodeListItemControllerOptions,
  ) {
    const { project, episode } = options;
    const { t } = useTranslation();
    const { data: beatsResponse } = queries.useEpisodeBeats(
      project,
      episode.number,
    );
    const planIdentities = queries.usePlanIdentities(project);
    const identityTask = useStageTask({
      taskType: "identity_planner",
      project,
      episode: episode.number,
      invalidateKeys: [
        queryKeys.episodes(project),
        queryKeys.episodeDetail(project, episode.number),
        queryKeys.characters(project),
        queryKeys.pipelineStatus(project),
      ],
      onComplete: (result) => {
        const data = (result ?? {}) as {
          new_count?: number;
          resolved_count?: number;
        };
        if ((data.new_count ?? 0) > 0) {
          toast.success(
            t("episode.script.planIdentitiesNew", { count: data.new_count }),
          );
        } else if ((data.resolved_count ?? 0) > 0) {
          toast.success(
            t("episode.script.planIdentitiesResolved", {
              count: data.resolved_count,
            }),
          );
        } else {
          toast.warning(t("episode.script.planIdentitiesNone"));
        }
      },
    });
    const planScenes = queries.usePlanEpisodeScenes(project);
    const planProps = queries.usePlanEpisodeProps(project);
    const sceneTask = useTaskController({
      key: {
        taskType: TASK_TYPES.EPISODE_SCENE_PLANNER,
        project,
        episode: episode.number,
      },
      invalidateKeys: [
        queryKeys.episodes(project),
        queryKeys.episodeDetail(project, episode.number),
        queryKeys.scenes(project),
        queryKeys.pipelineStatus(project),
      ],
      showCompleteToast: false,
      onComplete: (result) => {
        const data = (result ?? {}) as { total_count?: number };
        toast.success(
          t("episode.script.scenePlanComplete", {
            count: data.total_count ?? 0,
          }),
        );
      },
    });
    const propTask = useTaskController({
      key: {
        taskType: TASK_TYPES.EPISODE_PROP_PLANNER,
        project,
        episode: episode.number,
      },
      invalidateKeys: [
        queryKeys.episodes(project),
        queryKeys.episodeDetail(project, episode.number),
        queryKeys.props(project),
        queryKeys.pipelineStatus(project),
      ],
      showCompleteToast: false,
      onComplete: (result) => {
        const data = (result ?? {}) as { total_count?: number };
        toast.success(
          t("episode.script.propPlanComplete", {
            count: data.total_count ?? 0,
          }),
        );
      },
    });

    const handlePlanIdentities = async () => {
      try {
        const response = await planIdentities.mutateAsync(episode.number);
        if (response.ok === false) {
          toast.error(backendErrorToastMessage(response.error, t));
          return;
        }
        identityTask.start();
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const handlePlanScenes = async () => {
      try {
        const response = await planScenes.mutateAsync(episode.number);
        if (response.ok === false) {
          toast.error(backendErrorToastMessage(response.error, t));
          return;
        }
        if (isPlanEpisodeAssetsResult(response)) {
          toast.success(
            t("episode.script.scenePlanComplete", {
              count: response.data.total_count,
            }),
          );
          return;
        }
        sceneTask.start({ scope: response.scope });
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const handlePlanProps = async () => {
      try {
        const response = await planProps.mutateAsync(episode.number);
        if (response.ok === false) {
          toast.error(backendErrorToastMessage(response.error, t));
          return;
        }
        if (isPlanEpisodeAssetsResult(response)) {
          toast.success(
            t("episode.script.propPlanComplete", {
              count: response.data.total_count,
            }),
          );
          return;
        }
        propTask.start({ scope: response.scope });
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    return {
      ...options,
      handlePlanIdentities,
      handlePlanProps,
      handlePlanScenes,
      identityCount: episode.identity_ids?.length ?? 0,
      identityPending: planIdentities.isPending || identityTask.started,
      propCount: episode.prop_menu?.length ?? 0,
      propPending: planProps.isPending || propTask.started,
      sceneCount: episode.scene_menu?.length ?? 0,
      scenePending: planScenes.isPending || sceneTask.started,
      shotCount: beatsResponse?.data.length,
      snippet: (episode.summary ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80),
    };
  };
}

export type EpisodeListItemController = ReturnType<
  ReturnType<typeof createUseEpisodeListItemController>
>;
