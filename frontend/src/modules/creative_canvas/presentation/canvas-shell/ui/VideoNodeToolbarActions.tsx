// Copyright (c) 2026 AI anime
import { memo } from "react";

;
import { useVideoNodeToolbarController } from "@/modules/creative_canvas/canvasComposition";
import { VideoNodeToolbarActionsView, type VideoNodeData } from "@/modules/creative_canvas/presentation/canvas-shell/internal";

export interface VideoNodeToolbarActionsProps {
  projectId: string;
  nodeId: string;
  data: VideoNodeData;
}

export const VideoNodeToolbarActions = memo(
  ({ projectId, nodeId, data }: VideoNodeToolbarActionsProps) => {
    const controller = useVideoNodeToolbarController({ projectId, nodeId, data });
    return <VideoNodeToolbarActionsView controller={controller} />;
  },
);

VideoNodeToolbarActions.displayName = "VideoNodeToolbarActions";
