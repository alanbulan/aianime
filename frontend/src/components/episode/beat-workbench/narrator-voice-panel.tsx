// Copyright (c) 2026 AI anime
import {
  NarratorVoicePanelView,
  useNarratorVoicePanelController,
} from "@/modules/production/public";

export function NarratorVoicePanel({
  project,
  allowFirstPersonProjectVoice = false,
}: {
  project: string;
  allowFirstPersonProjectVoice?: boolean;
}) {
  const controller = useNarratorVoicePanelController({
    allowFirstPersonProjectVoice,
    project,
  });

  return <NarratorVoicePanelView controller={controller} />;
}
