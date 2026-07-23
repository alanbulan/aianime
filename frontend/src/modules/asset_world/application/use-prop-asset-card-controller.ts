// Copyright (c) 2026 AI anime
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/hooks/use-task-controller";
import { queryKeys } from "@/lib/query-keys";
import { propReferenceAssetScope } from "@/lib/task-scope";
import type { PropQueryHooks } from "@/modules/asset_world/application/prop-query-hooks";
import { isErrorDataResponse } from "@/modules/asset_world/application/response";
import type { PropAsset } from "@/modules/asset_world/domain/prop";
import { backendErrorToastMessage } from "@/shared/api/errors";

interface CreditCostQuery {
  data?: { data: { display?: string | null } };
}

export interface PropAssetCardControllerDependencies {
  openPropFreezone(project: string, propName: string): Promise<void>;
  useGenerationCreditCost(kind: string, value: string): CreditCostQuery;
}

export interface PropAssetCardControllerOptions {
  imageSourceSelection: string;
  onDelete(): void;
  onEdit(): void;
  project: string;
  prop: PropAsset;
  referenceCount: number;
}

export function createUsePropAssetCardController(
  propQueries: PropQueryHooks,
  dependencies: PropAssetCardControllerDependencies,
) {
  return function usePropAssetCardController({
    imageSourceSelection,
    onDelete,
    onEdit,
    project,
    prop,
    referenceCount,
  }: PropAssetCardControllerOptions) {
    const { t } = useTranslation();
    const generateReference =
      propQueries.useGeneratePropReferenceAsync(project, prop.name);
    const uploadReference = propQueries.useUploadPropReference(
      project,
      prop.name,
    );
    const referenceCost = dependencies.useGenerationCreditCost(
      "fixed_image",
      "prop_reference",
    );
    const [freezonePending, setFreezonePending] = useState(false);
    const referenceTask = useTaskController({
      key: {
        taskType: "prop_reference_asset",
        project,
        episode: 0,
        scope: propReferenceAssetScope(prop.name),
      },
      invalidateKeys: [queryKeys.props(project)],
    });

    const handleGenerateReference = async () => {
      try {
        const response = await generateReference.mutateAsync({
          model: imageSourceSelection,
        });
        if (isErrorDataResponse(response)) {
          toast.error(response.error);
          return;
        }
        referenceTask.start({ scope: response.scope });
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const handleOpenFreezone = async () => {
      setFreezonePending(true);
      try {
        await dependencies.openPropFreezone(project, prop.name);
        toast.success(t("assets.props.freezoneOpened"));
      } catch {
        toast.error(t("assets.props.freezoneOpenFailed"));
      } finally {
        setFreezonePending(false);
      }
    };

    const handleUploadReference = async (file: File) => {
      const response = await uploadReference.mutateAsync(file);
      if (isErrorDataResponse(response)) {
        toast.error(response.error);
        return;
      }
      toast.success(t("assets.props.uploadReferenceSuccess"));
    };

    return {
      freezonePending,
      generating: generateReference.isPending || referenceTask.started,
      handleGenerateReference,
      handleOpenFreezone,
      handleUploadReference,
      onDelete,
      onEdit,
      prop,
      referenceCost: referenceCost.data?.data.display ?? undefined,
      referenceCount,
      uploading: uploadReference.isPending,
    };
  };
}

export type PropAssetCardController = ReturnType<
  ReturnType<typeof createUsePropAssetCardController>
>;
