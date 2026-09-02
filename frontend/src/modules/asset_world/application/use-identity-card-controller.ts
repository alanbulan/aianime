// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/modules/task_execution/public";
import { queryKeys } from "@/lib/query-keys";
import type { CharacterQueryHooks } from "@/modules/asset_world/application/character-query-hooks";
import { isOkDataResponse } from "@/modules/asset_world/application/response";
import type {
  BeatReference,
  Identity,
  IdentityAttempts,
} from "@/modules/asset_world/domain/character";
import { backendErrorToastMessage } from "@/shared/api/errors";

export interface IdentityCardControllerOptions {
  ageLabel: string;
  characterAgeGroup?: string;
  characterName: string;
  identity: Identity;
  imageModel?: string;
  onAttempt(): void;
  project: string;
  referenceCount?: number;
  references?: BeatReference[];
  roleLabel: string;
}

export function createUseIdentityCardController(
  queries: CharacterQueryHooks,
) {
  return function useIdentityCardController(
    options: IdentityCardControllerOptions,
  ) {
    const {
      ageLabel,
      characterAgeGroup,
      characterName,
      identity,
      imageModel,
      onAttempt,
      project,
      referenceCount = 0,
      references = [],
      roleLabel,
    } = options;
    const { t } = useTranslation();
    const updateIdentity = queries.useUpdateIdentity(project, characterName);
    const deleteIdentity = queries.useDeleteIdentity(project, characterName);
    const deleteIdentityImage = queries.useDeleteIdentityImage(
      project,
      characterName,
    );
    const deleteCostume = queries.useDeleteIdentityCostume(
      project,
      characterName,
    );
    const generateImage = queries.useGenerateIdentityImageAsync(
      project,
      characterName,
    );
    const uploadImage = queries.useUploadIdentityImage(
      project,
      characterName,
    );
    const uploadCostume = queries.useUploadCostumeImage(
      project,
      characterName,
    );
    const uploadPortrait = queries.useUploadIdentityPortrait(
      project,
      characterName,
    );
    const generatePortrait = queries.useGenerateIdentityPortraitAsync(
      project,
      characterName,
    );
    const imageTask = useTaskController({
      key: {
        taskType: "identity_image",
        project,
        episode: 0,
        scope: `character:${characterName}:identity:${identity.identity_name}`,
      },
      invalidateKeys: [queryKeys.identities(project, characterName)],
      onError: () => toast.error(t("common.error")),
    });
    const portraitTask = useTaskController({
      key: {
        taskType: "character_portrait",
        project,
        episode: 0,
        scope: `character:${characterName}:identity_portrait:${identity.identity_name}`,
      },
      invalidateKeys: [queryKeys.identities(project, characterName)],
      onError: () => toast.error(t("common.error")),
    });
    const attempts = queries.useIdentityAttempts(
      project,
      characterName,
      identity.identity_id,
    );

    const [appearance, setAppearance] = useState(
      identity.appearance_details ?? "",
    );
    const [facePrompt, setFacePrompt] = useState(
      identity.face_prompt ?? "",
    );
    const [bodyType, setBodyType] = useState(identity.body_type ?? "");
    const imageInputRef = useRef<HTMLInputElement>(null);
    const costumeInputRef = useRef<HTMLInputElement>(null);
    const portraitInputRef = useRef<HTMLInputElement>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteImageOpen, setDeleteImageOpen] = useState(false);
    const [generateImageOpen, setGenerateImageOpen] = useState(false);
    const [generatePortraitOpen, setGeneratePortraitOpen] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameValue, setRenameValue] = useState(identity.identity_name);

    useEffect(() => {
      setAppearance(identity.appearance_details ?? "");
      setFacePrompt(identity.face_prompt ?? "");
      setBodyType(identity.body_type ?? "");
      setRenameValue(identity.identity_name);
    }, [
      identity.identity_id,
      identity.identity_name,
      identity.appearance_details,
      identity.face_prompt,
      identity.body_type,
      identity.age_group,
      identity.portrait_image_url,
    ]);

    const identityAttempts = isOkDataResponse<IdentityAttempts>(attempts.data)
      ? attempts.data.data
      : undefined;
    const imageAttempts = identityAttempts?.image_attempts ?? 0;
    const portraitAttempts = identityAttempts?.portrait_attempts ?? 0;
    const identityAge = identity.age_group ?? "";
    const isAgeVariant =
      Boolean(identityAge) && identityAge !== (characterAgeGroup ?? "");
    const appearanceDirty =
      appearance !== (identity.appearance_details ?? "");
    const referencesDirty =
      facePrompt !== (identity.face_prompt ?? "") ||
      bodyType !== (identity.body_type ?? "");

    const bumpAttempt = () => {
      onAttempt();
      void attempts.refetch();
    };

    const saveAppearance = async () => {
      try {
        await updateIdentity.mutateAsync({
          identityId: identity.identity_id,
          data: { appearance_details: appearance },
        });
        toast.success(t("characters.toasts.identityUpdated"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const saveReferences = async () => {
      try {
        await updateIdentity.mutateAsync({
          identityId: identity.identity_id,
          data: { face_prompt: facePrompt, body_type: bodyType },
        });
        toast.success(t("characters.toasts.identityUpdated"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const changeAgeGroup = async (value: string) => {
      try {
        await updateIdentity.mutateAsync({
          identityId: identity.identity_id,
          data: { age_group: value },
        });
        toast.success(t("characters.toasts.identityUpdated"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const confirmDelete = async () => {
      try {
        await deleteIdentity.mutateAsync(identity.identity_id);
        setDeleteOpen(false);
        toast.success(t("characters.toasts.identityDeleted"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const runGenerateImage = async () => {
      bumpAttempt();
      try {
        const response = await generateImage.mutateAsync({
          identityId: identity.identity_id,
          model: imageModel || undefined,
        });
        if (!response.ok) {
          toast.error(response.error || t("common.error"));
          return;
        }
        imageTask.start({ scope: response.scope, taskId: response.task_id });
        toast.success(t("characters.toasts.imageGenerating"));
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const runGeneratePortrait = async () => {
      bumpAttempt();
      try {
        const response = await generatePortrait.mutateAsync({
          identityId: identity.identity_id,
          model: imageModel || undefined,
        });
        if (!response.ok) {
          toast.error(response.error || t("common.error"));
          return;
        }
        portraitTask.start({ scope: response.scope, taskId: response.task_id });
        toast.success(t("characters.toasts.imageGenerating"));
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const requestGeneratePortrait = () => {
      if (!isAgeVariant) {
        toast.error(t("characters.identities.variantOnly"));
        return;
      }
      if (!facePrompt.trim()) {
        toast.error(t("characters.identities.portraitNeedsFacePrompt"));
        return;
      }
      setGeneratePortraitOpen(true);
    };

    const requestPortraitUpload = () => {
      if (!isAgeVariant) {
        toast.error(t("characters.identities.variantOnly"));
        return;
      }
      portraitInputRef.current?.click();
    };

    const removeImage = async () => {
      try {
        await deleteIdentityImage.mutateAsync(identity.identity_id);
        setDeleteImageOpen(false);
        toast.success(t("characters.identities.imageDeleted"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const removeCostume = async () => {
      try {
        await deleteCostume.mutateAsync(identity.identity_id);
        toast.success(t("characters.identities.costumeDeleted"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const rename = async () => {
      const nextName = renameValue.trim();
      if (!nextName || nextName === identity.identity_name) {
        setRenameOpen(false);
        return;
      }
      try {
        await updateIdentity.mutateAsync({
          identityId: identity.identity_id,
          data: { identity_name: nextName },
        });
        setRenameOpen(false);
        toast.success(t("characters.toasts.identityUpdated"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const upload = async (
      kind: "image" | "costume" | "portrait",
      file: File,
    ) => {
      try {
        if (kind === "image") {
          await uploadImage.mutateAsync({
            identityName: identity.identity_name,
            file,
          });
        } else if (kind === "costume") {
          await uploadCostume.mutateAsync({
            identityId: identity.identity_id,
            file,
          });
        } else {
          await uploadPortrait.mutateAsync({
            identityId: identity.identity_id,
            file,
          });
        }
        toast.success(t("characters.toasts.imageUploading"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    return {
      ageLabel,
      appearance,
      appearanceDirty,
      bodyType,
      changeAgeGroup,
      confirmDelete,
      costumeInputRef,
      deleteCostumePending: deleteCostume.isPending,
      deleteImageOpen,
      deleteImagePending: deleteIdentityImage.isPending,
      deleteOpen,
      deletePending: deleteIdentity.isPending,
      facePrompt,
      generateImageBusy: generateImage.isPending || imageTask.started,
      generateImageOpen,
      generatePortraitBusy:
        generatePortrait.isPending || portraitTask.started,
      generatePortraitOpen,
      identity,
      identityAge,
      imageAttempts,
      imageInputRef,
      isAgeVariant,
      portraitAttempts,
      portraitInputRef,
      project,
      characterName,
      referenceCount,
      references,
      referencesDirty,
      removeCostume,
      removeImage,
      rename,
      renameOpen,
      renameValue,
      requestGeneratePortrait,
      requestPortraitUpload,
      roleLabel,
      runGenerateImage,
      runGeneratePortrait,
      saveAppearance,
      saveReferences,
      setAppearance,
      setBodyType,
      setDeleteImageOpen,
      setDeleteOpen,
      setFacePrompt,
      setGenerateImageOpen,
      setGeneratePortraitOpen,
      setRenameOpen,
      setRenameValue,
      updatePending: updateIdentity.isPending,
      upload,
      uploadCostumePending: uploadCostume.isPending,
      uploadImagePending: uploadImage.isPending,
      uploadPortraitPending: uploadPortrait.isPending,
    };
  };
}

export type IdentityCardController = ReturnType<
  ReturnType<typeof createUseIdentityCardController>
>;
