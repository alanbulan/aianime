// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ScenePayload } from "@/modules/asset_world/application/scene-gateway";
import type {
  AssetRefType,
  BeatReference,
  SceneCoOccurrence,
} from "@/modules/asset_world/domain/character";
import {
  parseEnvironmentPrompt,
  serializeEnvironmentPrompt,
  type SceneEnvironmentSectionKey,
  type SceneEnvironmentSections,
} from "@/modules/asset_world/domain/scene-environment";
import {
  composeScenePlateName,
  isScenePlate,
  type SceneAsset,
} from "@/modules/asset_world/domain/scene";
import { timeOfDayOptions } from "@/lib/time-of-day";

const SCENE_FORM_DEFAULT: ScenePayload = {
  name: "",
  scene_type: "interior",
  base_scene_id: "",
  variant_id: "",
  time_of_day: "",
  environment_prompt: "",
  variant_prompt: "",
  description: "",
};

function trimmed(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export interface SceneDialogControllerDependencies {
  useNavigateToAsset(
    project: string,
  ): (type: AssetRefType, id: string) => void;
}

export interface SceneDialogControllerOptions {
  coOccurrence: SceneCoOccurrence;
  draftSeed?: Partial<ScenePayload> | null;
  initial: SceneAsset | null;
  onOpenChange(open: boolean): void;
  onSubmit(data: ScenePayload): Promise<void>;
  open: boolean;
  project: string;
  references: BeatReference[];
  saving: boolean;
}

export function createUseSceneDialogController(
  dependencies: SceneDialogControllerDependencies,
) {
  return function useSceneDialogController(
    options: SceneDialogControllerOptions,
  ) {
    const {
      coOccurrence,
      draftSeed,
      initial,
      onOpenChange,
      onSubmit,
      open,
      project,
      references,
      saving,
    } = options;
    const { t } = useTranslation();
    const navigateToAsset = dependencies.useNavigateToAsset(project);
    const [draft, setDraft] = useState<ScenePayload>(SCENE_FORM_DEFAULT);
    const [environment, setEnvironment] =
      useState<SceneEnvironmentSections>(() => parseEnvironmentPrompt(""));

    useEffect(() => {
      const nextDraft = initial
        ? {
            name: initial.name,
            aliases: initial.aliases ?? [],
            scene_type: initial.scene_type ?? "interior",
            base_scene_id:
              initial.base_scene_id ?? initial.derived_from_scene ?? "",
            variant_id: initial.variant_id ?? "",
            time_of_day: initial.time_of_day ?? "",
            environment_prompt: initial.environment_prompt ?? "",
            variant_prompt: initial.variant_prompt ?? "",
            description: initial.description ?? "",
            notes: initial.notes ?? "",
          }
        : { ...SCENE_FORM_DEFAULT, ...(draftSeed ?? {}) };
      setDraft(nextDraft);
      setEnvironment(
        parseEnvironmentPrompt(nextDraft.environment_prompt ?? ""),
      );
    }, [draftSeed, initial, open]);

    const plate = isScenePlate(initial ?? draftSeed);
    const generatedName = composeScenePlateName(draft);
    const hasPlateSuffix = Boolean(
      trimmed(draft.variant_id) || trimmed(draft.time_of_day),
    );
    const generatedNamePreview =
      generatedName && hasPlateSuffix
        ? generatedName
        : t("assets.scenes.generatedPlateNamePlaceholder", {
            defaultValue: "填写变体或时间后自动生成",
          });
    const title = initial
      ? plate
        ? t("assets.scenes.editPlate", { defaultValue: "编辑场景变体" })
        : t("assets.scenes.editScene")
      : plate
        ? t("assets.scenes.newPlate", { defaultValue: "添加场景变体" })
        : t("assets.scenes.newScene");
    const sceneTimeChoices = useMemo(
      () => timeOfDayOptions(draft.time_of_day),
      [draft.time_of_day],
    );
    const saveDisabled = plate
      ? saving ||
        !trimmed(draft.base_scene_id) ||
        !(trimmed(draft.variant_id) || trimmed(draft.time_of_day))
      : saving || !draft.name.trim();

    const updateDraft = (values: Partial<ScenePayload>) =>
      setDraft((current) => ({ ...current, ...values }));
    const updateEnvironment = (
      key: SceneEnvironmentSectionKey,
      value: string,
    ) => setEnvironment((current) => ({ ...current, [key]: value }));

    const submit = () => {
      const payload: ScenePayload = plate
        ? {
            ...draft,
            name: generatedName,
            base_scene_id: trimmed(draft.base_scene_id),
            variant_id: trimmed(draft.variant_id),
            time_of_day: trimmed(draft.time_of_day),
            environment_prompt: "",
            variant_prompt: trimmed(draft.variant_prompt),
          }
        : {
            ...draft,
            base_scene_id: "",
            variant_id: "",
            time_of_day: "",
            variant_prompt: "",
            environment_prompt: serializeEnvironmentPrompt(environment),
          };
      void onSubmit(payload);
    };

    return {
      close: () => onOpenChange(false),
      coOccurrence,
      draft,
      environment,
      generatedNamePreview,
      hasPlateSuffix,
      initial,
      navigateToIdentity: (id: string) => navigateToAsset("identity", id),
      navigateToProp: (id: string) => navigateToAsset("prop", id),
      onOpenChange,
      open,
      plate,
      project,
      references,
      saveDisabled,
      saving,
      sceneTimeChoices,
      submit,
      title,
      updateDraft,
      updateEnvironment,
    };
  };
}

export type SceneDialogController = ReturnType<
  ReturnType<typeof createUseSceneDialogController>
>;
