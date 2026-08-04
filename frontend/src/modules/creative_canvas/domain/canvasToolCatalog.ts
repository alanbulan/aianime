// Copyright (c) 2026 AI anime
import { stringifyAnnotationItems } from './canvasAnnotationCodec';
import { NODE_TOOL_TYPES } from './canvasNodeTool';
import {
  isCanvasToolImageSourceNode,
  resolveCanvasNodeSourceImageUrl,
  type CanvasNodeImageSourceLike,
} from './canvasNodeImageSource';
import type { CanvasToolPlugin } from './canvasTool';

// imageGen 也算图片源节点：上传的参考图同样可被裁剪 / 标注 / 分格抽取，
// 结果会落到新建的下游节点，不会覆盖参考图本身。
function hasToolableImage(node: CanvasNodeImageSourceLike): boolean {
  return (
    isCanvasToolImageSourceNode(node) &&
    Boolean(resolveCanvasNodeSourceImageUrl(node))
  );
}

export const cropToolPlugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.crop,
  labelKey: 'tool.crop',
  icon: 'crop',
  editor: 'crop',
  supportsNode: (node) => hasToolableImage(node),
  createInitialOptions: () => ({
    aspectRatio: 'free',
    customAspectRatio: '',
  }),
  fields: [
    {
      key: 'aspectRatio',
      label: '目标比例',
      type: 'select',
      options: [
        { label: '自由', value: 'free' },
        { label: '1:1', value: '1:1' },
        { label: '16:9', value: '16:9' },
        { label: '9:16', value: '9:16' },
        { label: '4:3', value: '4:3' },
        { label: '3:4', value: '3:4' },
      ],
    },
  ],
  execute: async (sourceImageUrl, options, context) =>
    await context.processTool(NODE_TOOL_TYPES.crop, sourceImageUrl, options),
};

export const annotateToolPlugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.annotate,
  labelKey: 'tool.annotate',
  icon: 'annotate',
  editor: 'annotate',
  supportsNode: (node) => hasToolableImage(node),
  createInitialOptions: () => ({
    color: '#ff4d4f',
    lineWidthPercent: 0.4,
    fontSizePercent: 10,
    annotations: stringifyAnnotationItems([]),
  }),
  fields: [],
  execute: async (sourceImageUrl, options, context) =>
    await context.processTool(NODE_TOOL_TYPES.annotate, sourceImageUrl, options),
};

export const splitStoryboardToolPlugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.splitStoryboard,
  labelKey: 'tool.split',
  icon: 'split',
  editor: 'split',
  supportsNode: (node) => hasToolableImage(node),
  createInitialOptions: () => ({
    rows: 3,
    cols: 3,
    lineThicknessPercent: 0.5,
  }),
  fields: [],
  execute: async (sourceImageUrl, options, context) =>
    await context.processTool(NODE_TOOL_TYPES.splitStoryboard, sourceImageUrl, options),
};

export const builtInToolPlugins: CanvasToolPlugin[] = [
  cropToolPlugin,
  splitStoryboardToolPlugin,
  annotateToolPlugin,
];
