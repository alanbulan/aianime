// Copyright (c) 2026 AI anime
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useAssetFocus } from "@/hooks/use-asset-focus";
import { useAssetsDeepLink } from "@/hooks/use-assets-deep-link";
import type { CharacterQueryHooks } from "@/modules/asset_world/application/character-query-hooks";
import type {
  AssetReferenceIndex,
  Character,
} from "@/modules/asset_world/domain/character";

interface IdentityGridControllerDependencies {
  useAssetReferenceIndex(project: string): AssetReferenceIndex;
}

export interface IdentitiesGridControllerOptions {
  character: Character;
  imageModel?: string;
  onAttempt(): void;
  project: string;
}

const AGE_LABEL_KEYS: Record<string, string> = {
  child: "characters.ageGroups.child",
  youth: "characters.ageGroups.young",
  middle: "characters.ageGroups.middle",
  elder: "characters.ageGroups.elder",
};

export function createUseIdentitiesGridController(
  queries: CharacterQueryHooks,
  dependencies: IdentityGridControllerDependencies,
) {
  return function useIdentitiesGridController(
    options: IdentitiesGridControllerOptions,
  ) {
    const { character, imageModel, onAttempt, project } = options;
    const { t } = useTranslation();
    const { data: identitiesResponse } = queries.useCharacterIdentities(
      project,
      character.name,
    );
    const referenceIndex = dependencies.useAssetReferenceIndex(project);
    const deepLink = useAssetsDeepLink();
    const createIdentity = queries.useCreateIdentity(project, character.name);
    const identities = identitiesResponse?.data ?? [];
    const gridRef = useAssetFocus(
      deepLink.type === "identity" ? deepLink.id : null,
      identities.length > 0,
    );
    const [newName, setNewName] = useState("");
    const [newAgeGroup, setNewAgeGroup] = useState("");
    const [newAppearance, setNewAppearance] = useState("");
    const [addOpen, setAddOpen] = useState(false);

    useEffect(() => {
      setNewName("");
      setNewAgeGroup("");
      setNewAppearance("");
      setAddOpen(false);
    }, [character.name]);

    const resetForm = () => {
      setNewName("");
      setNewAgeGroup("");
      setNewAppearance("");
    };

    const setOpen = (open: boolean) => {
      setAddOpen(open);
      if (!open) resetForm();
    };

    const add = async () => {
      if (!newName.trim()) return;
      try {
        await createIdentity.mutateAsync({
          identity_name: newName.trim(),
          age_group: newAgeGroup || undefined,
          appearance_details: newAppearance.trim() || undefined,
        });
        resetForm();
        setAddOpen(false);
        toast.success(t("characters.toasts.identityAdded"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const ageLabelKey = character.age_group
      ? AGE_LABEL_KEYS[character.age_group]
      : undefined;

    return {
      add,
      addOpen,
      ageLabel: ageLabelKey ? t(ageLabelKey) : "",
      character,
      createPending: createIdentity.isPending,
      gridRef,
      identities,
      imageModel,
      newAgeGroup,
      newAppearance,
      newName,
      onAttempt,
      project,
      referenceIndex,
      roleLabel: character.role ?? "",
      setAddOpen: setOpen,
      setNewAgeGroup,
      setNewAppearance,
      setNewName,
    };
  };
}

export type IdentitiesGridController = ReturnType<
  ReturnType<typeof createUseIdentitiesGridController>
>;
