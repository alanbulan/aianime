// Copyright (c) 2026 AI anime
import { memo } from "react";

;
import { useAudioNodeToolbarController } from "@/features/canvas/hooks/useAudioNodeToolbarController";
import { AudioNodeToolbarActionsView, type AudioNodeData } from "@/modules/creative_canvas/public";

export interface AudioNodeToolbarActionsProps {
  nodeId: string;
  data: AudioNodeData;
}

export const AudioNodeToolbarActions = memo(
  ({ nodeId, data }: AudioNodeToolbarActionsProps) => {
    const controller = useAudioNodeToolbarController({ nodeId, data });
    return <AudioNodeToolbarActionsView controller={controller} />;
  },
);

AudioNodeToolbarActions.displayName = "AudioNodeToolbarActions";
