// Copyright (c) 2026 AI anime
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import type { AssetTab } from "@/modules/asset_world/domain/character";
import { writeStoredAssetTab } from "@/modules/asset_world/infrastructure/asset-tab-storage";

export function useAssetWorkspaceNavigation(project: string) {
  const navigate = useNavigate();
  return useCallback(
    (tab: AssetTab) => {
      writeStoredAssetTab(project, tab);
      navigate({
        to: "/projects/$project/characters",
        params: { project },
      });
    },
    [navigate, project],
  );
}
