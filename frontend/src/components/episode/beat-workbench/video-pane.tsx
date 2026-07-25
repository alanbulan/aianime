// Copyright (c) 2026 AI anime
import {
  useUpdateBeat,
  type Beat,
} from "@/modules/narrative_planning/public";
import {
  useVideoPaneController,
  VideoPaneView,
} from "@/modules/production/public";
import type { BeatStageState } from "@/types/beat-state";

interface VideoPaneProps {
  beat: Beat;
  project: string;
  episode: number;
  state: BeatStageState;
  /** Episode-level video backend selected in the video panel. */
  defaultBackend: string;
  showAudioMediaStatus?: boolean;
}

/**
 * 视频 sub-tab — first-frame preview + video preview + per-beat regen.
 * Per-beat backend override is deferred (see v3 spec P4 follow-up).
 */
export function VideoPane({
  beat,
  project,
  episode,
  state,
  defaultBackend,
  showAudioMediaStatus = true,
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

  return (
    <VideoPaneView
      controller={controller}
      showAudioMediaStatus={showAudioMediaStatus}
    />
  );
}
