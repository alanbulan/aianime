// Copyright (c) 2026 AI anime
import { createElement, type ReactNode } from "react";

import {
  CharactersPageContent as AssetCharactersPageContent,
  type AssetWorldCanvasNavigation,
  type AssetWorldVoiceCatalog,
} from "@/modules/asset_world/public";
import {
  createPresetCanvasAudioVoice,
  deleteCanvasAudioVoice,
  designCanvasAudioVoice,
  loadCanvasAudioReferences,
  openPresetProjectionInMyCanvas,
} from "@/modules/creative_canvas/public";
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

const assetWorldVoiceCatalog: AssetWorldVoiceCatalog = {
  async loadVoiceOptions(project) {
    const references = await loadCanvasAudioReferences(project);
    return references.flatMap((reference) => {
      const voiceId = reference.ref.voiceId?.trim();
      if (reference.ref.scope !== "user_custom" || !voiceId) return [];
      return [
        {
          voiceId,
          label: reference.label?.trim() || voiceId,
          previewUrl: reference.previewUrl,
        },
      ];
    });
  },
  deleteVoice: deleteCanvasAudioVoice,
  createPresetVoice: createPresetCanvasAudioVoice,
  designVoice: designCanvasAudioVoice,
};

export function CharactersPageContent({ project }: { project: string }) {
  return createElement(AssetCharactersPageContent, {
    canvasNavigation: assetWorldCanvasNavigation,
    project,
    renderNarratorVoicePanel: (voiceProject) =>
      createElement(NarratorVoicePanel, {
        allowFirstPersonProjectVoice: true,
        project: voiceProject,
        voiceCatalog: assetWorldVoiceCatalog,
      }),
    voiceCatalog: assetWorldVoiceCatalog,
  });
}

function EpisodeListItemContent({
  episode,
  onSelect,
  project,
}: {
  episode: Episode;
  onSelect(): void;
  project: string;
}) {
  const controller = useEpisodeListItemController({
    episode,
    onSelect,
    project,
  });
  return createElement(EpisodeListItemView, { controller });
}

interface EpisodesPageContentProps {
  episodeContent: ReactNode;
  onBackToEpisodes(): void;
  onSelectEpisode(episodeNumber: number): void;
  project: string;
  selectedEpisodeNumber: number | null;
}

function EpisodesPageControllerContent({
  episodeContent,
  onBackToEpisodes,
  onSelectEpisode,
  project,
  selectedEpisodeNumber,
}: EpisodesPageContentProps) {
  const controller = useEpisodesPageController({
    onBackToEpisodes,
    onSelectEpisode,
    project,
    selectedEpisodeNumber,
  });
  const renderEpisodeListItem = (episode: Episode) =>
    createElement(EpisodeListItemContent, {
      episode,
      key: episode.number,
      onSelect: () => onSelectEpisode(episode.number),
      project,
    });

  return createElement(EpisodesPageView, {
    controller,
    episodeContent,
    renderEpisodeListItem,
  });
}

export function EpisodesPageContent(props: EpisodesPageContentProps) {
  return createElement(EpisodesPageControllerContent, props);
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
