// Copyright (c) 2026 AI anime
export const NODE_TOOL_TYPES = {
  crop: "crop",
  annotate: "annotate",
  splitStoryboard: "split-storyboard",
} as const;

export type NodeToolType =
  (typeof NODE_TOOL_TYPES)[keyof typeof NODE_TOOL_TYPES];

export interface CanvasToolDialogRequest {
  nodeId: string;
  toolType: NodeToolType;
}
