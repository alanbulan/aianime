// Copyright (c) 2026 AI anime
import { stringifyAnnotationItems } from './canvasAnnotationCodec';
import { NODE_TOOL_TYPES } from './canvasNodeTool';
import { FACE_PASS_DEFAULT_SIZE_LEVEL } from './facePassGeometry';
import {
  FACE_PASS_DEFAULT_DETECTOR,
  FACE_PASS_DEFAULT_HAAR_FALLBACK,
  FACE_PASS_DEFAULT_NO_FACE,
  FACE_PASS_DEFAULT_SINGLE_EYE,
} from './facePassOptions';
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

// 人脸直过：把检测到的眼睛用白底黑边方块遮住，结果落到新建的下游节点。
// 参数与上游线上版 /api/detect 一致（detector / size / singleEye / haarFallback / noFace），
// 通过表单编辑器暴露，不做一键直出。
export const facePassToolPlugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.facePass,
  labelKey: 'nodeToolbar.facePass',
  icon: 'facePass',
  editor: 'form',
  supportsNode: (node) => hasToolableImage(node),
  createInitialOptions: () => ({
    detector: FACE_PASS_DEFAULT_DETECTOR,
    noFace: FACE_PASS_DEFAULT_NO_FACE,
    singleEye: FACE_PASS_DEFAULT_SINGLE_EYE,
    size: FACE_PASS_DEFAULT_SIZE_LEVEL,
    haarFallback: FACE_PASS_DEFAULT_HAAR_FALLBACK,
  }),
  fields: [
    {
      key: 'detector',
      label: '检测器',
      type: 'select',
      options: [
        { label: 'YuNet（ONNX，默认）', value: 'onnx' },
        { label: 'Haar 级联', value: 'haar' },
      ],
    },
    {
      key: 'size',
      label: '遮挡大小（2 ≈ 眼睛，10 ≈ 整张脸）',
      type: 'number',
      min: 1,
      max: 10,
      step: 1,
    },
    {
      key: 'singleEye',
      label: '每张脸只遮一只眼',
      type: 'checkbox',
    },
    {
      key: 'haarFallback',
      label: 'Haar 补漏（仅 YuNet 生效）',
      type: 'select',
      options: [
        { label: '仅 YuNet 未检出人脸时（默认）', value: 'auto' },
        { label: '总是补漏（多人合影漏脸时用）', value: 'always' },
        { label: '关闭', value: 'off' },
      ],
    },
    {
      key: 'noFace',
      label: '跳过人脸检测，全图扫描眼睛（仅 Haar 生效）',
      type: 'checkbox',
    },
  ],
  execute: async (sourceImageUrl, options, context) =>
    await context.processTool(NODE_TOOL_TYPES.facePass, sourceImageUrl, options),
};

export const builtInToolPlugins: CanvasToolPlugin[] = [
  cropToolPlugin,
  splitStoryboardToolPlugin,
  facePassToolPlugin,
  annotateToolPlugin,
];
