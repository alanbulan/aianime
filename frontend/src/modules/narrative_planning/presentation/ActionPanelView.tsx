// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";

import { EpisodeEmptyState } from "@/components/episode/episode-empty-state";
import type { ActionPanelController } from "@/modules/narrative_planning/application/use-action-panel-controller";

export interface ActionPanelViewProps {
  controller: ActionPanelController;
  singleBeatContent: ReactNode;
}

export function ActionPanelView({
  controller,
  singleBeatContent,
}: ActionPanelViewProps) {
  const { t } = useTranslation();

  if (controller.beat) return singleBeatContent;

  return (
    <EpisodeEmptyState
      icon={FileText}
      description={t("episode.beat.clickToView")}
    />
  );
}
