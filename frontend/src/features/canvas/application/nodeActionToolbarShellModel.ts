// Copyright (c) 2026 AI anime
import {
  isAudioNode,
  isGroupNode,
  isImageEditNode,
  isProtectedProjectionGroupNode,
  isStoryboardGroupNode,
  isVideoNode,
  type AudioNodeData,
  type CanvasNode,
  type VideoNodeData,
} from "@/features/canvas/domain/canvasNodes";
import { nodeMainlineFlags } from "@/modules/creative_canvas/public";

export interface NodeActionToolbarShellProjection {
  isStoryboardGroup: boolean;
  isImageEdit: boolean;
  videoData: VideoNodeData | null;
  audioData: AudioNodeData | null;
  isUngroupableGroup: boolean;
  groupBackgroundColor: string | null;
  isPresetLocked: boolean;
}

export function projectNodeActionToolbarShell(
  node: CanvasNode,
): NodeActionToolbarShellProjection {
  const isGroup = isGroupNode(node);
  return {
    isStoryboardGroup: isStoryboardGroupNode(node),
    isImageEdit: isImageEditNode(node),
    videoData: isVideoNode(node) ? node.data : null,
    audioData: isAudioNode(node) ? node.data : null,
    isUngroupableGroup:
      isGroup && !isProtectedProjectionGroupNode(node),
    groupBackgroundColor: isGroup
      ? (node.data.backgroundColor ?? null)
      : null,
    isPresetLocked: nodeMainlineFlags(node).isPresetManaged,
  };
}
