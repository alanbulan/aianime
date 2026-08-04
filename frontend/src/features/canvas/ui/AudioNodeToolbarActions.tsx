// Copyright (c) 2026 AI anime
import { memo } from "react";

import type { AudioNodeData } from "@/features/canvas/domain/canvasNodes";
import { useAudioNodeToolbarController } from "@/features/canvas/hooks/useAudioNodeToolbarController";
import { AudioNodeToolbarActionsView } from "@/modules/creative_canvas/public";

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
