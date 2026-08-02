// Copyright (c) 2026 AI anime
import { createElement, type ComponentProps } from 'react';
import type { NodeTypes } from '@xyflow/react';

import { AudioNode } from './AudioNode';
import { BeatContextNode } from './BeatContextNode';
import { GroupNode } from './GroupNode';
import { ImageEditNode } from './ImageEditNode';
import { ImageGenNode } from './ImageGenNode';
import { ImageNode } from './ImageNode';
import { Pano360ViewerNode } from './Pano360ViewerNode';
import { ScriptNode } from './ScriptNode';
import { SkillNode } from './SkillNode';
import { StoryboardGenNode } from './StoryboardGenNode';
import { StoryboardNode } from './StoryboardNode';
import { TextAnnotationNode } from './TextAnnotationNode';
import { ThreeDWorldNode } from './ThreeDWorldNode';
import { UploadNode } from './UploadNode';
import { VideoComposeNode } from './VideoComposeNode';
import { VideoNode } from './VideoNode';
import { VideoStoryNode } from './VideoStoryNode';

export interface CanvasNodeTypeContext {
  projectId: string;
  canvasId: string;
}

type UnboundAudioNodeProps = Omit<
  ComponentProps<typeof AudioNode>,
  keyof CanvasNodeTypeContext
>;
type UnboundBeatContextNodeProps = Omit<
  ComponentProps<typeof BeatContextNode>,
  keyof CanvasNodeTypeContext
>;
type UnboundGroupNodeProps = Omit<
  ComponentProps<typeof GroupNode>,
  'projectId'
>;
type UnboundVideoNodeProps = Omit<
  ComponentProps<typeof VideoNode>,
  keyof CanvasNodeTypeContext
>;
type UnboundVideoComposeNodeProps = Omit<
  ComponentProps<typeof VideoComposeNode>,
  keyof CanvasNodeTypeContext
>;
type UnboundImageGenNodeProps = Omit<
  ComponentProps<typeof ImageGenNode>,
  keyof CanvasNodeTypeContext
>;
type UnboundImageEditNodeProps = Omit<
  ComponentProps<typeof ImageEditNode>,
  keyof CanvasNodeTypeContext
>;
type UnboundImageNodeProps = Omit<
  ComponentProps<typeof ImageNode>,
  keyof CanvasNodeTypeContext
>;
type UnboundPano360ViewerNodeProps = Omit<
  ComponentProps<typeof Pano360ViewerNode>,
  'projectId'
>;
type UnboundScriptNodeProps = Omit<
  ComponentProps<typeof ScriptNode>,
  keyof CanvasNodeTypeContext
>;
type UnboundSkillNodeProps = Omit<
  ComponentProps<typeof SkillNode>,
  keyof CanvasNodeTypeContext
>;
type UnboundStoryboardGenNodeProps = Omit<
  ComponentProps<typeof StoryboardGenNode>,
  keyof CanvasNodeTypeContext
>;
type UnboundStoryboardNodeProps = Omit<
  ComponentProps<typeof StoryboardNode>,
  'projectId'
>;
type UnboundThreeDWorldNodeProps = Omit<
  ComponentProps<typeof ThreeDWorldNode>,
  keyof CanvasNodeTypeContext
>;
type UnboundTextAnnotationNodeProps = Omit<
  ComponentProps<typeof TextAnnotationNode>,
  keyof CanvasNodeTypeContext
>;
type UnboundUploadNodeProps = Omit<
  ComponentProps<typeof UploadNode>,
  'projectId'
>;

export function createCanvasNodeTypes({
  projectId,
  canvasId,
}: CanvasNodeTypeContext): NodeTypes {
  const BoundAudioNode = (props: UnboundAudioNodeProps) =>
    createElement(AudioNode, { ...props, projectId, canvasId });
  BoundAudioNode.displayName = 'BoundAudioNode';
  const BoundBeatContextNode = (props: UnboundBeatContextNodeProps) =>
    createElement(BeatContextNode, { ...props, projectId, canvasId });
  BoundBeatContextNode.displayName = 'BoundBeatContextNode';
  const BoundGroupNode = (props: UnboundGroupNodeProps) =>
    createElement(GroupNode, { ...props, projectId });
  BoundGroupNode.displayName = 'BoundGroupNode';
  const BoundImageGenNode = (props: UnboundImageGenNodeProps) =>
    createElement(ImageGenNode, { ...props, projectId, canvasId });
  BoundImageGenNode.displayName = 'BoundImageGenNode';
  const BoundImageEditNode = (props: UnboundImageEditNodeProps) =>
    createElement(ImageEditNode, { ...props, projectId, canvasId });
  BoundImageEditNode.displayName = 'BoundImageEditNode';
  const BoundImageNode = (props: UnboundImageNodeProps) =>
    createElement(ImageNode, { ...props, projectId, canvasId });
  BoundImageNode.displayName = 'BoundImageNode';
  const BoundPano360ViewerNode = (props: UnboundPano360ViewerNodeProps) =>
    createElement(Pano360ViewerNode, { ...props, projectId });
  BoundPano360ViewerNode.displayName = 'BoundPano360ViewerNode';
  const BoundScriptNode = (props: UnboundScriptNodeProps) =>
    createElement(ScriptNode, { ...props, projectId, canvasId });
  BoundScriptNode.displayName = 'BoundScriptNode';
  const BoundSkillNode = (props: UnboundSkillNodeProps) =>
    createElement(SkillNode, { ...props, projectId, canvasId });
  BoundSkillNode.displayName = 'BoundSkillNode';
  const BoundStoryboardGenNode = (props: UnboundStoryboardGenNodeProps) =>
    createElement(StoryboardGenNode, { ...props, projectId, canvasId });
  BoundStoryboardGenNode.displayName = 'BoundStoryboardGenNode';
  const BoundStoryboardNode = (props: UnboundStoryboardNodeProps) =>
    createElement(StoryboardNode, { ...props, projectId });
  BoundStoryboardNode.displayName = 'BoundStoryboardNode';
  const BoundThreeDWorldNode = (props: UnboundThreeDWorldNodeProps) =>
    createElement(ThreeDWorldNode, { ...props, projectId, canvasId });
  BoundThreeDWorldNode.displayName = 'BoundThreeDWorldNode';
  const BoundTextAnnotationNode = (props: UnboundTextAnnotationNodeProps) =>
    createElement(TextAnnotationNode, { ...props, projectId, canvasId });
  BoundTextAnnotationNode.displayName = 'BoundTextAnnotationNode';
  const BoundUploadNode = (props: UnboundUploadNodeProps) =>
    createElement(UploadNode, { ...props, projectId });
  BoundUploadNode.displayName = 'BoundUploadNode';
  const BoundVideoNode = (props: UnboundVideoNodeProps) =>
    createElement(VideoNode, { ...props, projectId, canvasId });
  BoundVideoNode.displayName = 'BoundVideoNode';
  const BoundVideoComposeNode = (props: UnboundVideoComposeNodeProps) =>
    createElement(VideoComposeNode, { ...props, projectId, canvasId });
  BoundVideoComposeNode.displayName = 'BoundVideoComposeNode';

  return {
    audioNode: BoundAudioNode,
    beatContextNode: BoundBeatContextNode,
    exportImageNode: BoundImageNode,
    groupNode: BoundGroupNode,
    imageGenNode: BoundImageGenNode,
    imageNode: BoundImageEditNode,
    pano360ViewerNode: BoundPano360ViewerNode,
    scriptNode: BoundScriptNode,
    skillNode: BoundSkillNode,
    storyboardGenNode: BoundStoryboardGenNode,
    storyboardNode: BoundStoryboardNode,
    textAnnotationNode: BoundTextAnnotationNode,
    threeDWorldNode: BoundThreeDWorldNode,
    uploadNode: BoundUploadNode,
    videoComposeNode: BoundVideoComposeNode,
    videoNode: BoundVideoNode,
    videoStoryNode: VideoStoryNode,
  };
}

export { AudioNode, BeatContextNode, GroupNode, ImageEditNode, ImageGenNode, ImageNode, Pano360ViewerNode, ScriptNode, SkillNode, StoryboardGenNode, StoryboardNode, TextAnnotationNode, ThreeDWorldNode, UploadNode, VideoComposeNode, VideoNode, VideoStoryNode };
