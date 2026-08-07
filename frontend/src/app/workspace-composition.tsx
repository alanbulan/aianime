// Copyright (c) 2026 AI anime
import { createElement, type ReactNode } from "react";

import {
  CharactersPageContent as AssetCharactersPageContent,
  type AssetWorldCanvasNavigation,
} from "@/modules/asset_world/public";
import { openPresetProjectionInMyCanvas } from "@/modules/creative_canvas/public";
import {
  useBeatsPageController,
  useEpisodeListItemController,
  useEpisodesPageController,
  useScriptPageController,
} from "@/modules/narrative_planning/composition";
import type { Episode } from "@/modules/narrative_planning/domain/types";
import { BeatsPageView } from "@/modules/narrative_planning/presentation/BeatsPageView";
import {
  EpisodeListItemView,
  EpisodesPageView,
} from "@/modules/narrative_planning/presentation/EpisodesPageView";
import { ScriptPageView } from "@/modules/narrative_planning/presentation/ScriptPageView";
import { NarratorVoicePanel } from "@/modules/production/public";

const assetWorldCanvasNavigation: AssetWorldCanvasNavigation = {
  openCharacter: (project, characterName) =>
    openPresetProjectionInMyCanvas(project, {
      scope: "asset",
      asset_kind: "character",
      character: characterName,
    }),
  async openProp(project, propName) {
    await openPresetProjectionInMyCanvas(project, {
      scope: "asset",
      asset_kind: "prop",
      asset_id: propName,
    });
  },
  async openScene(project, sceneName) {
    await openPresetProjectionInMyCanvas(project, {
      scope: "asset",
      asset_kind: "scene",
      asset_id: sceneName,
    });
  },
};

export function CharactersPageContent({ project }: { project: string }) {
  return createElement(AssetCharactersPageContent, {
    canvasNavigation: assetWorldCanvasNavigation,
    project,
    renderNarratorVoicePanel: (voiceProject) =>
      createElement(NarratorVoicePanel, {
        allowFirstPersonProjectVoice: true,
        project: voiceProject,
      }),
  });
}

function EpisodeListItemContent({
  episode,
  identityCostDisplay,
  onSelect,
  project,
  propCostDisplay,
  sceneCostDisplay,
}: {
  episode: Episode;
  identityCostDisplay?: string | null;
  onSelect(): void;
  project: string;
  propCostDisplay?: string | null;
  sceneCostDisplay?: string | null;
}) {
  const controller = useEpisodeListItemController({
    episode,
    identityCostDisplay,
    onSelect,
    project,
    propCostDisplay,
    sceneCostDisplay,
  });
  return createElement(EpisodeListItemView, { controller });
}

export function EpisodesPageContent({
  episodeContent,
  onBackToEpisodes,
  onSelectEpisode,
  project,
  selectedEpisodeNumber,
}: {
  episodeContent: ReactNode;
  onBackToEpisodes(): void;
  onSelectEpisode(episodeNumber: number): void;
  project: string;
  selectedEpisodeNumber: number | null;
}) {
  const controller = useEpisodesPageController({
    onBackToEpisodes,
    onSelectEpisode,
    project,
    selectedEpisodeNumber,
  });
  const renderEpisodeListItem = (episode: Episode) =>
    createElement(EpisodeListItemContent, {
      episode,
      identityCostDisplay: controller.planIdentitiesCostDisplay,
      key: episode.number,
      onSelect: () => onSelectEpisode(episode.number),
      project,
      propCostDisplay: controller.planPropsCostDisplay,
      sceneCostDisplay: controller.planScenesCostDisplay,
    });

  return createElement(EpisodesPageView, {
    controller,
    episodeContent,
    renderEpisodeListItem,
  });
}

export function ScriptPageContent({
  episodeNumber,
  project,
}: {
  episodeNumber: number;
  project: string;
}) {
  const controller = useScriptPageController({ episodeNumber, project });
  return createElement(ScriptPageView, { controller });
}

export function BeatsPageContent(
  options: Parameters<typeof useBeatsPageController>[0],
) {
  const controller = useBeatsPageController(options);
  return createElement(BeatsPageView, { controller });
}
