// Copyright (c) 2026 AI anime
import { useNarratorVoicePanelController } from "@/modules/production/composition";
import { NarratorVoicePanelView } from "@/modules/production/presentation/NarratorVoicePanelView";

export interface NarratorVoicePanelProps {
  allowFirstPersonProjectVoice?: boolean;
  project: string;
}

export function NarratorVoicePanel({
  allowFirstPersonProjectVoice = false,
  project,
}: NarratorVoicePanelProps) {
  const controller = useNarratorVoicePanelController({
    allowFirstPersonProjectVoice,
    project,
  });

  return <NarratorVoicePanelView controller={controller} />;
}
