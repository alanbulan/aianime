// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/modules/task_execution/public";
import { queryKeys } from "@/lib/query-keys";
import {
  getScriptReviewFeedback,
  type ScriptFeedback,
} from "@/lib/script-feedback";
import { TASK_TYPES } from "@/modules/task_execution/public";
import {
  isPlanEpisodeAssetsResult,
  type NarrativePlanningQueryHooks,
} from "@/modules/narrative_planning/application/query-hooks";
import {
  backendErrorToastMessage,
  BillingRuleNotConfiguredError,
} from "@/shared/api/errors";
import { saveScopes, trackSave } from "@/shared/stores/save-status-store";
import type { Character } from "@/modules/asset_world/public";

export type ScriptAssetPlanningCategory =
  | "identities"
  | "scenes"
  | "props";

export type ScriptGenerationMode = "duration" | "literal";

export const SCRIPT_REWRITE_LIMITS = {
  targetBeats: { min: 5, max: 80 },
  beatCharsMin: { min: 4, max: 50 },
  beatCharsMax: { min: 4, max: 80 },
} as const;

export const SCRIPT_DURATION_LIMITS = { min: 30, max: 600 } as const;

const SCRIPT_RHYTHM_SECONDS: Record<string, number> = {
  fast: 3,
  medium: 4,
  slow: 5,
};
const SCRIPT_TARGET_BEAT_LIMITS = { min: 5, max: 80 } as const;

interface CharacterListQuery {
  data?: { data: Character[] };
}

interface ProjectQuery {
  data?: { spine_template?: string | null; rhythm?: string | null };
}

interface CreditCostQuery {
  data?: { data: { display?: string | null } };
  error: unknown;
}

export interface ScriptPageControllerDependencies {
  useCharacters(project: string): CharacterListQuery;
  useProject(project: string): ProjectQuery;
  useGenerationCreditCost(kind: string, value: string): CreditCostQuery;
}

export interface ScriptPageControllerOptions {
  project: string;
  episodeNumber: number;
}

// Keep partially typed values intact; limits are applied when the field blurs.
export function parseRewriteNumber(value: string, fallback: number): number {
  if (value.trim() === "") return fallback;
  const next = Number(value);
  return Number.isFinite(next) ? Math.round(next) : fallback;
}

export function clampRewriteNumber(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function creditCostDisplay(
  query: CreditCostQuery,
  billingRuleFallback: string,
): string | null {
  return (
    query.data?.data.display ??
    (query.error instanceof BillingRuleNotConfiguredError
      ? billingRuleFallback
      : null)
  );
}

export function createUseScriptPageController(
  queries: NarrativePlanningQueryHooks,
  dependencies: ScriptPageControllerDependencies,
) {
  return function useScriptPageController(
    options: ScriptPageControllerOptions,
  ) {
    const { project, episodeNumber } = options;
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const notifyScriptFeedback = (feedback: ScriptFeedback) => {
      const message = t(feedback.key, feedback.values);
      if (feedback.type === "warning") toast.warning(message);
      else toast.success(message);
    };

    const { data: episodeResponse } = queries.useEpisodeDetail(
      project,
      episodeNumber,
    );
    const { data: projectData } = dependencies.useProject(project);
    const { data: beatsResponse, isLoading: beatsLoading } =
      queries.useEpisodeBeats(project, episodeNumber);
    const { data: charactersResponse } = dependencies.useCharacters(project);
    const updateEpisode = queries.useUpdateEpisode(project);
    const planIdentities = queries.usePlanIdentities(project);
    const planScenes = queries.usePlanEpisodeScenes(project);
    const planProps = queries.usePlanEpisodeProps(project);
    const generateScript = queries.useGenerateScript(project, episodeNumber);
    const generateRewrite = queries.useGenerateRewrite(project, episodeNumber);

    const planIdentitiesCost = dependencies.useGenerationCreditCost(
      "feature",
      "identity_planner",
    );
    const planScenesCost = dependencies.useGenerationCreditCost(
      "feature",
      "episode_scene_planner",
    );
    const planPropsCost = dependencies.useGenerationCreditCost(
      "feature",
      "episode_prop_planner",
    );
    const generateScriptCost = dependencies.useGenerationCreditCost(
      "feature",
      "script_writer",
    );
    const billingRuleFallback = t("common.billingRuleNotConfiguredShort");

    const scriptTask = useTaskController({
      key: {
        taskType: TASK_TYPES.SCRIPT_WRITER,
        project,
        episode: episodeNumber,
      },
      alsoReconcile: [TASK_TYPES.LITERAL_SCRIPT_WRITER],
      invalidateKeys: [
        queryKeys.script(project, episodeNumber),
        queryKeys.beats(project, episodeNumber),
        queryKeys.pipelineStatus(project),
      ],
      showCompleteToast: false,
      onComplete: (result) =>
        notifyScriptFeedback(getScriptReviewFeedback(result)),
    });

    const episodeData = episodeResponse?.data;
    const characters = charactersResponse?.data ?? [];
    const identityIds = episodeData?.identity_ids ?? [];
    const identityDefaultMap = episodeData?.identity_default_map ?? {};
    const rawContent = episodeData?.raw_content ?? "";
    const sourceText = episodeData?.beat_source_text ?? "";
    const sceneMenu = episodeData?.scene_menu ?? [];
    const propMenu = episodeData?.prop_menu ?? [];

    const [pickerOpen, setPickerOpen] = useState(false);
    const [assetCategory, setAssetCategory] =
      useState<ScriptAssetPlanningCategory>("identities");
    const [rewriteTargetBeats, setRewriteTargetBeats] = useState(18);
    const [rewriteBeatCharsMin, setRewriteBeatCharsMin] = useState(14);
    const [rewriteBeatCharsMax, setRewriteBeatCharsMax] = useState(20);
    const [scriptMode, setScriptMode] =
      useState<ScriptGenerationMode>("duration");
    const [targetDurationTotal, setTargetDurationTotal] = useState(120);
    const initializedSourceRef = useRef("");

    const sourceScope = saveScopes.episodeSource(project, episodeNumber);
    const identitiesScope = saveScopes.episodeIdentities(
      project,
      episodeNumber,
    );

    useEffect(() => {
      const initKey = `${project}:${episodeNumber}`;
      if (!episodeData || initializedSourceRef.current === initKey) return;
      if (sourceText.trim() || !rawContent.trim()) return;

      initializedSourceRef.current = initKey;
      void trackSave(sourceScope, () =>
        updateEpisode.mutateAsync({
          episodeNum: episodeNumber,
          data: { beat_source_text: rawContent },
        }),
      )
        .then(() =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.episodeDetail(project, episodeNumber),
          }),
        )
        .catch(() => {
          initializedSourceRef.current = "";
          toast.error(t("common.error"));
        });
    }, [
      episodeData,
      episodeNumber,
      project,
      queryClient,
      rawContent,
      sourceScope,
      sourceText,
      t,
      updateEpisode,
    ]);

    const invalidateIdentityData = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.episodes(project) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.episodeDetail(project, episodeNumber),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters(project),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.pipelineStatus(project),
      });
      for (const character of characters) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.identities(project, character.name),
        });
      }
    };

    const notifyIdentityPlanResult = (result: unknown) => {
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
    };

    const identityTask = useTaskController({
      key: {
        taskType: TASK_TYPES.IDENTITY_PLANNER,
        project,
        episode: episodeNumber,
      },
      invalidateKeys: [
        queryKeys.episodes(project),
        queryKeys.episodeDetail(project, episodeNumber),
        queryKeys.characters(project),
        queryKeys.pipelineStatus(project),
      ],
      showCompleteToast: false,
      onComplete: (result) => {
        invalidateIdentityData();
        notifyIdentityPlanResult(result);
      },
    });
    const sceneTask = useTaskController({
      key: {
        taskType: TASK_TYPES.EPISODE_SCENE_PLANNER,
        project,
        episode: episodeNumber,
      },
      invalidateKeys: [
        queryKeys.episodes(project),
        queryKeys.episodeDetail(project, episodeNumber),
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
        episode: episodeNumber,
      },
      invalidateKeys: [
        queryKeys.episodes(project),
        queryKeys.episodeDetail(project, episodeNumber),
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

    const saveField = async (
      data: Parameters<typeof updateEpisode.mutateAsync>[0]["data"],
    ) => {
      try {
        await trackSave(identitiesScope, () =>
          updateEpisode.mutateAsync({ episodeNum: episodeNumber, data }),
        );
      } catch {
        toast.error(t("common.error"));
      }
    };

    const handleIdentityChange = (
      next: string[],
      nextDefaultMap: Record<string, string>,
    ) => {
      void saveField({
        identity_ids: next,
        identity_default_map: nextDefaultMap,
      });
    };

    const handleSourceSave = async (next: string) => {
      const savePromise = trackSave(sourceScope, () =>
        updateEpisode.mutateAsync({
          episodeNum: episodeNumber,
          data: { beat_source_text: next },
        }),
      );
      try {
        await toast
          .promise(savePromise, {
            loading: t("common.saveStatus.saving"),
            success: t("common.saveStatus.saved"),
            error: t("common.saveStatus.error"),
          })
          .unwrap();
      } catch {
        // toast.promise renders the failure state.
      }
    };

    const ensureBeatSourceText = async () => {
      if (sourceText.trim()) return sourceText;

      const fallback = rawContent.trim();
      if (!fallback) {
        toast.error(t("episode.script.noRawText"));
        return "";
      }

      await trackSave(sourceScope, () =>
        updateEpisode.mutateAsync({
          episodeNum: episodeNumber,
          data: { beat_source_text: rawContent },
        }),
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.episodeDetail(project, episodeNumber),
      });
      return rawContent;
    };

    const handleGenerateRewrite = async () => {
      if (rewriteBeatCharsMin > rewriteBeatCharsMax) {
        toast.error(t("episode.script.minGtMax"));
        return;
      }

      try {
        const response = await generateRewrite.mutateAsync({
          target_beats: rewriteTargetBeats,
          beat_chars_min: rewriteBeatCharsMin,
          beat_chars_max: rewriteBeatCharsMax,
        });
        if (response.ok === false) {
          toast.error(response.error || t("common.error"));
          return;
        }
        await queryClient.invalidateQueries({
          queryKey: queryKeys.episodeDetail(project, episodeNumber),
        });
        toast.success(t("episode.script.rewriteComplete"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const handleGenerateScript = async () => {
      try {
        const readySource = await ensureBeatSourceText();
        if (!readySource.trim()) return;
        if (identityIds.length === 0) {
          toast.error(t("episode.script.identityRequired"));
          return;
        }
        if (sceneMenu.length === 0) {
          toast.error(t("episode.script.sceneRequired"));
          return;
        }
        const response = await generateScript.mutateAsync({
          rhythm: scriptMode,
          ...(scriptMode === "duration"
            ? { target_duration_total: targetDurationTotal }
            : {}),
        });
        if (response.ok === false) {
          toast.error(backendErrorToastMessage(response.error, t));
          return;
        }
        scriptTask.start({ scope: response.scope });
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const handlePlanIdentities = async () => {
      try {
        const response = await planIdentities.mutateAsync(episodeNumber);
        if (response.ok === false) {
          toast.error(backendErrorToastMessage(response.error, t));
          return;
        }
        identityTask.start({ scope: response.scope });
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const handlePlanScenes = async () => {
      try {
        const response = await planScenes.mutateAsync(episodeNumber);
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
        const response = await planProps.mutateAsync(episodeNumber);
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

    const identityPlanning = planIdentities.isPending || identityTask.started;
    const generating = generateScript.isPending || scriptTask.started;
    const rawProgressPercent = Math.round(
      (scriptTask.stream.progress ?? 0) * 100,
    );
    const scriptProgressPercent = Math.min(
      100,
      Math.max(0, rawProgressPercent),
    );
    const generateButtonBusy =
      generateScript.isPending || generateRewrite.isPending;

    const handleGenerateButtonClick = () => {
      if (scriptTask.started) {
        void scriptTask.stop();
        return;
      }
      void handleGenerateScript();
    };

    return {
      assetCategory,
      beats: beatsResponse?.data ?? [],
      beatsLoading,
      characters,
      generateButtonBusy,
      generateButtonDisabled: scriptTask.started
        ? scriptTask.stopping
        : generateButtonBusy,
      generateButtonTitle:
        !scriptTask.started && identityIds.length === 0
          ? t("episode.script.identityRequired")
          : !scriptTask.started && sceneMenu.length === 0
            ? t("episode.script.sceneRequired")
          : undefined,
      generateScriptCostDisplay: creditCostDisplay(
        generateScriptCost,
        billingRuleFallback,
      ),
      generating,
      handleGenerateButtonClick,
      handleGenerateRewrite,
      handleIdentityChange,
      handlePlanIdentities,
      handlePlanProps,
      handlePlanScenes,
      handleSourceSave,
      identityDefaultMap,
      identityIds,
      identityPlanning,
      isNarratedProject: projectData?.spine_template === "narrated",
      onAssetCategoryChange: setAssetCategory,
      onRewriteBeatCharsMaxBlur: () =>
        setRewriteBeatCharsMax((value) =>
          clampRewriteNumber(
            value,
            SCRIPT_REWRITE_LIMITS.beatCharsMax.min,
            SCRIPT_REWRITE_LIMITS.beatCharsMax.max,
          ),
        ),
      onRewriteBeatCharsMaxChange: (value: string) =>
        setRewriteBeatCharsMax((current) =>
          parseRewriteNumber(value, current),
        ),
      onRewriteBeatCharsMinBlur: () =>
        setRewriteBeatCharsMin((value) =>
          clampRewriteNumber(
            value,
            SCRIPT_REWRITE_LIMITS.beatCharsMin.min,
            SCRIPT_REWRITE_LIMITS.beatCharsMin.max,
          ),
        ),
      onRewriteBeatCharsMinChange: (value: string) =>
        setRewriteBeatCharsMin((current) =>
          parseRewriteNumber(value, current),
        ),
      onRewriteTargetBeatsBlur: () =>
        setRewriteTargetBeats((value) =>
          clampRewriteNumber(
            value,
            SCRIPT_REWRITE_LIMITS.targetBeats.min,
            SCRIPT_REWRITE_LIMITS.targetBeats.max,
          ),
        ),
      onRewriteTargetBeatsChange: (value: string) =>
        setRewriteTargetBeats((current) =>
          parseRewriteNumber(value, current),
        ),
      pickerOpen,
      planIdentitiesCostDisplay: creditCostDisplay(
        planIdentitiesCost,
        billingRuleFallback,
      ),
      planPropsCostDisplay: creditCostDisplay(
        planPropsCost,
        billingRuleFallback,
      ),
      planScenesCostDisplay: creditCostDisplay(
        planScenesCost,
        billingRuleFallback,
      ),
      project,
      propMenu,
      propPlanning: planProps.isPending || propTask.started,
      rawContent,
      rewriteBeatCharsMax,
      rewriteBeatCharsMin,
      rewriteLimits: SCRIPT_REWRITE_LIMITS,
      rewritePending: generateRewrite.isPending,
      rewriteTargetBeats,
      sceneMenu,
      scenePlanning: planScenes.isPending || sceneTask.started,
      scriptProgressLabel:
        scriptTask.stream.currentTask || t("common.preparing"),
      scriptProgressPercent,
      scriptTaskStarted: scriptTask.started,
      scriptTaskStopping: scriptTask.stopping,
      setPickerOpen,
      sourceSaving: updateEpisode.isPending,
      sourceTextForEditor: sourceText || rawContent,
      scriptMode,
      onScriptModeChange: setScriptMode,
      targetDurationTotal,
      targetDurationLimits: SCRIPT_DURATION_LIMITS,
      onTargetDurationChange: (value: string) =>
        setTargetDurationTotal((current) =>
          parseRewriteNumber(value, current),
        ),
      onTargetDurationBlur: () =>
        setTargetDurationTotal((value) =>
          clampRewriteNumber(
            value,
            SCRIPT_DURATION_LIMITS.min,
            SCRIPT_DURATION_LIMITS.max,
          ),
        ),
      estimatedBeatCount: Math.min(
        SCRIPT_TARGET_BEAT_LIMITS.max,
        Math.max(
          SCRIPT_TARGET_BEAT_LIMITS.min,
          Math.round(
            targetDurationTotal /
              (SCRIPT_RHYTHM_SECONDS[
                projectData?.rhythm?.trim().toLowerCase() ?? ""
              ] ?? 4),
          ),
        ),
      ),
      rhythmSeconds:
        SCRIPT_RHYTHM_SECONDS[
          projectData?.rhythm?.trim().toLowerCase() ?? ""
        ] ?? 4,
      episodeNumber,
    };
  };
}

export type ScriptPageController = ReturnType<
  ReturnType<typeof createUseScriptPageController>
>;
