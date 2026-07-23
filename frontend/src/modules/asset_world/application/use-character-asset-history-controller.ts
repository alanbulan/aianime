// Copyright (c) 2026 AI anime
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { CharacterQueryHooks } from "@/modules/asset_world/application/character-query-hooks";
import { isOkDataResponse } from "@/modules/asset_world/application/response";
import type {
  CharacterAssetHistory,
  CharacterAssetHistoryEntry,
  CharacterAssetKind,
} from "@/modules/asset_world/domain/character";
import { backendErrorToastMessage } from "@/shared/api/errors";

function formatHistoryTime(
  value: string | undefined,
  locale: string,
): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatHistoryBytes(bytes: number | undefined): string {
  if (!bytes || !Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface CharacterAssetHistoryControllerOptions {
  characterName: string;
  historyUrl?: string;
  identityId?: string;
  kind: CharacterAssetKind;
  project: string;
  restoreUrl?: string;
}

export function createUseCharacterAssetHistoryController(
  queries: CharacterQueryHooks,
) {
  return function useCharacterAssetHistoryController(
    options: CharacterAssetHistoryControllerOptions,
  ) {
    const {
      characterName,
      historyUrl,
      identityId,
      kind,
      project,
      restoreUrl,
    } = options;
    const { i18n, t } = useTranslation();
    const [open, setOpen] = useState(false);
    const history = queries.useCharacterAssetHistory(
      project,
      characterName,
      historyUrl,
      { enabled: open },
    );
    const restoreAsset = queries.useRestoreCharacterAsset(
      project,
      characterName,
    );
    const historyData = isOkDataResponse<CharacterAssetHistory>(history.data)
      ? history.data.data
      : null;

    const restore = async (entry: CharacterAssetHistoryEntry) => {
      if (!restoreUrl) return;
      try {
        const response = await restoreAsset.mutateAsync({
          restoreUrl,
          kind,
          historyId: entry.history_id,
          identityId,
        });
        if (!response.ok) {
          toast.error(response.error || t("common.error"));
          return;
        }
        toast.success(t("characters.history.restored"));
        await history.refetch();
        setOpen(false);
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    return {
      apiError:
        history.data && !history.data.ok ? history.data.error : "",
      available: Boolean(historyUrl && restoreUrl),
      currentUrl: historyData?.current_url ?? null,
      entries: (historyData?.entries ?? []).map((entry) => ({
        ...entry,
        createdAtLabel: formatHistoryTime(entry.created_at, i18n.language),
        sizeLabel: formatHistoryBytes(entry.bytes),
      })),
      isFetching: history.isFetching,
      isLoading: history.isLoading,
      open,
      refresh: history.refetch,
      restore,
      restoringHistoryId: restoreAsset.isPending
        ? restoreAsset.variables?.historyId
        : undefined,
      restorePending: restoreAsset.isPending,
      setOpen,
    };
  };
}

export type CharacterAssetHistoryController = ReturnType<
  ReturnType<typeof createUseCharacterAssetHistoryController>
>;
