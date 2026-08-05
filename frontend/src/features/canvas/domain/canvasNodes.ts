// Copyright (c) 2026 AI anime
import type { Node } from '@xyflow/react';
import { CANVAS_NODE_TYPES } from '@/modules/creative_canvas/public';
import type {
  AudioNodeData,
  CanvasNode,
  ExportImageNodeData,
  GroupNodeData,
  ImageEditNodeData,
  ImageGenNodeData,
  Pano360ViewerNodeData,
  ScriptNodeData,
  StoryboardGenNodeData,
  StoryboardSplitNodeData,
  TextAnnotationNodeData,
  UploadImageNodeData,
  VideoNodeData,
} from '@/modules/creative_canvas/public';

export function isUploadNode(
  node: CanvasNode | null | undefined
): node is Node<UploadImageNodeData, typeof CANVAS_NODE_TYPES.upload> {
  return node?.type === CANVAS_NODE_TYPES.upload;
}

export function isImageEditNode(
  node: CanvasNode | null | undefined
): node is Node<ImageEditNodeData, typeof CANVAS_NODE_TYPES.imageEdit> {
  return node?.type === CANVAS_NODE_TYPES.imageEdit;
}

export function isImageGenNode(
  node: CanvasNode | null | undefined
): node is Node<ImageGenNodeData, typeof CANVAS_NODE_TYPES.imageGen> {
  return node?.type === CANVAS_NODE_TYPES.imageGen;
}

export function isExportImageNode(
  node: CanvasNode | null | undefined
): node is Node<ExportImageNodeData, typeof CANVAS_NODE_TYPES.exportImage> {
  return node?.type === CANVAS_NODE_TYPES.exportImage;
}

export function isGroupNode(
  node: CanvasNode | null | undefined
): node is Node<GroupNodeData, typeof CANVAS_NODE_TYPES.group> {
  return node?.type === CANVAS_NODE_TYPES.group;
}

export function isStoryboardGroupNode(
  node: CanvasNode | null | undefined
): node is Node<GroupNodeData, typeof CANVAS_NODE_TYPES.group> {
  return isGroupNode(node) && node.data.storyboardGroup === true;
}

export function isProtectedProjectionGroupNode(
  node: CanvasNode | null | undefined
): node is Node<GroupNodeData, typeof CANVAS_NODE_TYPES.group> {
  if (!isGroupNode(node)) {
    return false;
  }
  return (
    node.data.user_spawned !== true &&
    typeof node.data.projection_key === 'string' &&
    node.data.projection_key.trim().length > 0
  );
}

export function isTextAnnotationNode(
  node: CanvasNode | null | undefined
): node is Node<TextAnnotationNodeData, typeof CANVAS_NODE_TYPES.textAnnotation> {
  return node?.type === CANVAS_NODE_TYPES.textAnnotation;
}

export function isStoryboardSplitNode(
  node: CanvasNode | null | undefined
): node is Node<StoryboardSplitNodeData, typeof CANVAS_NODE_TYPES.storyboardSplit> {
  return node?.type === CANVAS_NODE_TYPES.storyboardSplit;
}

export function isStoryboardGenNode(
  node: CanvasNode | null | undefined
): node is Node<StoryboardGenNodeData, typeof CANVAS_NODE_TYPES.storyboardGen> {
  return node?.type === CANVAS_NODE_TYPES.storyboardGen;
}

export function isVideoNode(
  node: CanvasNode | null | undefined
): node is Node<VideoNodeData, typeof CANVAS_NODE_TYPES.video> {
  return node?.type === CANVAS_NODE_TYPES.video;
}

export function isAudioNode(
  node: CanvasNode | null | undefined
): node is Node<AudioNodeData, typeof CANVAS_NODE_TYPES.audio> {
  return node?.type === CANVAS_NODE_TYPES.audio;
}

export function isScriptNode(
  node: CanvasNode | null | undefined
): node is Node<ScriptNodeData, typeof CANVAS_NODE_TYPES.script> {
  return node?.type === CANVAS_NODE_TYPES.script;
}

export function isPano360ViewerNode(
  node: CanvasNode | null | undefined
): node is Node<Pano360ViewerNodeData, typeof CANVAS_NODE_TYPES.pano360Viewer> {
  return node?.type === CANVAS_NODE_TYPES.pano360Viewer;
}
