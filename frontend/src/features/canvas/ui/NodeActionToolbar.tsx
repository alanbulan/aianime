// Copyright (c) 2026 AI anime
import { memo } from "react";

import {
  isAudioNode,
  isGroupNode,
  isImageEditNode,
  isProtectedProjectionGroupNode,
  isStoryboardGroupNode,
  isVideoNode,
} from "@/features/canvas/domain/canvasNodes";
import {
  nodeMainlineFlags,
  projectNodeActionToolbarShell,
} from "@/modules/creative_canvas/public";

import {
  NodeActionToolbarView,
  type NodeActionToolbarViewProps,
} from "./NodeActionToolbarView";

type NodeActionToolbarProps = Omit<
  NodeActionToolbarViewProps,
  "projection"
>;

export const NodeActionToolbar = memo((props: NodeActionToolbarProps) => {
  const { node } = props;
  const isGroup = isGroupNode(node);
  const projection = projectNodeActionToolbarShell({
    isGroup,
    isProtectedProjectionGroup: isProtectedProjectionGroupNode(node),
    isStoryboardGroup: isStoryboardGroupNode(node),
    isImageEdit: isImageEditNode(node),
    videoData: isVideoNode(node) ? node.data : null,
    audioData: isAudioNode(node) ? node.data : null,
    groupBackgroundColor: isGroup ? node.data.backgroundColor : null,
    isPresetLocked: nodeMainlineFlags(node).isPresetManaged,
  });
  return <NodeActionToolbarView {...props} projection={projection} />;
});

NodeActionToolbar.displayName = "NodeActionToolbar";
