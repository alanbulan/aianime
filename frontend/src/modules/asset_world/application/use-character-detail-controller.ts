// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/modules/task_execution/public";
import { queryKeys } from "@/lib/query-keys";
import type { CharacterQueryHooks } from "@/modules/asset_world/application/character-query-hooks";
import type {
  Character,
  CharacterMainCopy,
} from "@/modules/asset_world/domain/character";
import {
  backendErrorToastMessage,
} from "@/shared/api/errors";
import { saveScopes, trackSave } from "@/shared/stores/save-status-store";

export interface CharacterDetailControllerDependencies {
  openCharacterFreezone(project: string, characterName: string): Promise<unknown>;
}

export interface CharacterDetailControllerOptions {
  attemptCount: number;
  character: Character;
  imageModel?: string;
  mainCopy: CharacterMainCopy;
  onAttempt(): void;
  onDeleted(): void;
  onRenamed(nextName: string): void;
  project: string;
}

export function createUseCharacterDetailController(
  queries: CharacterQueryHooks,
  dependencies: CharacterDetailControllerDependencies,
) {
  return function useCharacterDetailController(
    options: CharacterDetailControllerOptions,
  ) {
    const {
      attemptCount,
      character,
      imageModel,
      mainCopy,
      onAttempt,
      onDeleted,
      onRenamed,
      project,
    } = options;
    const { t } = useTranslation();
    const updateCharacter = queries.useUpdateCharacter(
      project,
      character.name,
    );
    const deleteCharacter = queries.useDeleteCharacter(project);
    const generatePortrait = queries.useGeneratePortraitAsync(
      project,
      character.name,
    );
    const uploadPortrait = queries.useUploadPortrait(
      project,
      character.name,
    );
    const portraitTask = useTaskController({
      key: {
        taskType: "character_portrait",
        project,
        episode: 0,
        scope: `character:${character.name}:portrait`,
      },
      invalidateKeys: [queryKeys.characters(project)],
      onError: () => toast.error(t("common.error")),
    });

    const detailsScope = saveScopes.characterDetails(project, character.name);
    const portraitInputRef = useRef<HTMLInputElement>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [freezonePending, setFreezonePending] = useState(false);
    const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false);
    const [displayName, setDisplayName] = useState(character.name);
    const [role, setRole] = useState(character.role ?? "");
    const [bodyType, setBodyType] = useState(character.body_type ?? "");
    const [aliases, setAliases] = useState(
      (character.aliases ?? []).join(", "),
    );
    const [description, setDescription] = useState(
      character.description ?? "",
    );
    const [facePrompt, setFacePrompt] = useState(
      character.face_prompt ?? "",
    );

    useEffect(() => {
      setDisplayName(character.name);
      setRole(character.role ?? "");
      setBodyType(character.body_type ?? "");
      setAliases((character.aliases ?? []).join(", "));
      setDescription(character.description ?? "");
      setFacePrompt(character.face_prompt ?? "");
    }, [
      character.aliases,
      character.body_type,
      character.description,
      character.face_prompt,
      character.name,
      character.role,
    ]);

    const saveField = async (data: Partial<Character>) => {
      try {
        await trackSave(detailsScope, () =>
          updateCharacter.mutateAsync(data),
        );
      } catch {
        toast.error(t("common.error"));
      }
    };

    const handleToggleMain = async () => {
      try {
        await updateCharacter.mutateAsync({
          is_main: !character.is_main,
        });
        toast.success(
          character.is_main ? mainCopy.mainUnset : mainCopy.mainSet,
        );
      } catch {
        toast.error(t("common.error"));
      }
    };

    const confirmDelete = async () => {
      try {
        await deleteCharacter.mutateAsync(character.name);
        setDeleteOpen(false);
        toast.success(t("characters.toasts.deleted"));
        onDeleted();
      } catch {
        toast.error(t("common.error"));
      }
    };

    const openFreezone = async () => {
      setFreezonePending(true);
      try {
        await dependencies.openCharacterFreezone(project, character.name);
        toast.success(t("characters.freezone.opened"));
      } catch {
        toast.error(t("characters.freezone.openFailed"));
      } finally {
        setFreezonePending(false);
      }
    };

    const generate = async () => {
      onAttempt();
      try {
        const response = await generatePortrait.mutateAsync({
          model: imageModel || undefined,
        });
        if (!response.ok) {
          toast.error(response.error || t("common.error"));
          return;
        }
        portraitTask.start({ scope: response.scope });
        toast.success(t("characters.toasts.imageGenerating"));
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const upload = async (file: File) => {
      try {
        await uploadPortrait.mutateAsync(file);
        toast.success(`${t("common.upload")} ✓`);
      } catch {
        toast.error(t("common.error"));
      }
    };

    const handleBlurName = async () => {
      const nextName = displayName.trim();
      if (!nextName) {
        setDisplayName(character.name);
        return;
      }
      if (nextName === character.name) {
        setDisplayName(nextName);
        return;
      }
      try {
        await trackSave(detailsScope, () =>
          updateCharacter.mutateAsync({ name: nextName }),
        );
        onRenamed(nextName);
      } catch {
        setDisplayName(character.name);
        toast.error(t("common.error"));
      }
    };

    return {
      character,
      details: {
        aliases,
        bodyType,
        description,
        displayName,
        facePrompt,
        handleBlurAliases: () => {
          const previous = (character.aliases ?? []).join(", ");
          if (aliases === previous) return;
          void saveField({
            aliases: aliases
              .split(",")
              .map((alias) => alias.trim())
              .filter(Boolean),
          });
        },
        handleBlurBodyType: () => {
          if (bodyType !== (character.body_type ?? "")) {
            void saveField({ body_type: bodyType || undefined });
          }
        },
        handleBlurDescription: () => {
          if (description !== (character.description ?? "")) {
            void saveField({ description: description || undefined });
          }
        },
        handleBlurFacePrompt: () => {
          if (facePrompt !== (character.face_prompt ?? "")) {
            void saveField({ face_prompt: facePrompt || undefined });
          }
        },
        handleBlurName,
        handleBlurRole: () => {
          if (role !== (character.role ?? "")) {
            void saveField({ role: role || undefined });
          }
        },
        handleInstantSelect: (
          field: "gender" | "age_group",
          value: string | null,
        ) => {
          if (value !== null) void saveField({ [field]: value });
        },
        role,
        setAliases,
        setBodyType,
        setDescription,
        setDisplayName,
        setFacePrompt,
        setRole,
      },
      detailsScope,
      header: {
        confirmDelete,
        deleteOpen,
        deletePending: deleteCharacter.isPending,
        freezonePending,
        mainCopy,
        openFreezone,
        setDeleteOpen,
        toggleMain: handleToggleMain,
        updatePending: updateCharacter.isPending,
      },
      portrait: {
        attemptCount,
        generate,
        generateBusy: generatePortrait.isPending || portraitTask.started,
        generateConfirmOpen,
        inputRef: portraitInputRef,
        setGenerateConfirmOpen,
        upload,
        uploadPending: uploadPortrait.isPending,
      },
      project,
    };
  };
}

export type CharacterDetailController = ReturnType<
  ReturnType<typeof createUseCharacterDetailController>
>;
