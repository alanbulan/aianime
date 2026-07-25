// Copyright (c) 2026 AI anime
import { createElement } from "react";

import {
  useUpdateBeat,
  type Beat,
} from "@/modules/narrative_planning/public";
import { useVideoPaneController } from "@/modules/production/composition";
import { VideoPaneView } from "@/modules/production/presentation/VideoPaneView";
import type { BeatStageState } from "@/types/beat-state";

export interface VideoPaneProps {
  beat: Beat;
  defaultBackend: string;
  episode: number;
  project: string;
  showAudioMediaStatus?: boolean;
  state: BeatStageState;
}

export function VideoPane({
  beat,
  defaultBackend,
  episode,
  project,
  showAudioMediaStatus = true,
  state,
}: VideoPaneProps) {
  const updateBeat = useUpdateBeat(project, episode);
  const controller = useVideoPaneController({
    beat,
    defaultBackend,
    episode,
    project,
    savePending: updateBeat.isPending,
    state,
    updateBeat: (command) => updateBeat.mutateAsync(command),
  });

  return createElement(VideoPaneView, {
    controller,
    showAudioMediaStatus,
  });
}
