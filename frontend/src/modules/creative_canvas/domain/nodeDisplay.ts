// Copyright (c) 2026 AI anime
import {
  CANVAS_CONNECTION_NODE_TYPES,
  type CanvasConnectionNodeType,
} from './canvasConnection';

export type CanvasExportResultKind =
  | 'generic'
  | 'storyboardGenOutput'
  | 'storyboardSplitExport'
  | 'storyboardFrameEdit'
  | 'matte'
  | 'upscale';

export interface CanvasNodeDisplayData {
  displayName?: unknown;
  label?: unknown;
  resultKind?: CanvasExportResultKind;
}

export const DEFAULT_NODE_DISPLAY_NAME: Record<CanvasConnectionNodeType, string> = {
  [CANVAS_CONNECTION_NODE_TYPES.upload]: '上传资源',
  [CANVAS_CONNECTION_NODE_TYPES.imageEdit]: 'AI 图片',
  [CANVAS_CONNECTION_NODE_TYPES.imageGen]: '图片节点',
  [CANVAS_CONNECTION_NODE_TYPES.exportImage]: '结果图片',
  [CANVAS_CONNECTION_NODE_TYPES.beatContext]: '镜头上下文',
  [CANVAS_CONNECTION_NODE_TYPES.textAnnotation]: '文本',
  [CANVAS_CONNECTION_NODE_TYPES.group]: '分组',
  [CANVAS_CONNECTION_NODE_TYPES.storyboardSplit]: '分格抽取结果',
  [CANVAS_CONNECTION_NODE_TYPES.storyboardGen]: '多版本宫格',
  [CANVAS_CONNECTION_NODE_TYPES.video]: '视频',
  [CANVAS_CONNECTION_NODE_TYPES.audio]: '音频',
  [CANVAS_CONNECTION_NODE_TYPES.videoStory]: '视频故事',
  [CANVAS_CONNECTION_NODE_TYPES.videoCompose]: '视频合成',
  [CANVAS_CONNECTION_NODE_TYPES.script]: '脚本生成器',
  [CANVAS_CONNECTION_NODE_TYPES.pano360Viewer]: '360° 全景查看器',
  [CANVAS_CONNECTION_NODE_TYPES.threeDWorld]: '3D 世界',
  [CANVAS_CONNECTION_NODE_TYPES.skill]: '技能',
  [CANVAS_CONNECTION_NODE_TYPES.style]: '风格',
};

export const EXPORT_RESULT_DISPLAY_NAME: Record<CanvasExportResultKind, string> = {
  generic: '结果图片',
  storyboardGenOutput: '宫格输出',
  storyboardSplitExport: '分格导出',
  storyboardFrameEdit: '单格结果',
  matte: '抠图结果',
  upscale: '高清放大',
};

function resolveExportResultDefault(data: CanvasNodeDisplayData): string {
  const resultKind = data.resultKind ?? 'generic';
  return EXPORT_RESULT_DISPLAY_NAME[resultKind];
}

export function getDefaultNodeDisplayName(
  type: CanvasConnectionNodeType,
  data: CanvasNodeDisplayData,
): string {
  if (type === CANVAS_CONNECTION_NODE_TYPES.exportImage) {
    return resolveExportResultDefault(data);
  }
  return DEFAULT_NODE_DISPLAY_NAME[type];
}

export function resolveNodeDisplayName(
  type: CanvasConnectionNodeType,
  data: CanvasNodeDisplayData,
): string {
  const customTitle = typeof data.displayName === 'string' ? data.displayName.trim() : '';
  if (customTitle) {
    return customTitle;
  }

  if (type === CANVAS_CONNECTION_NODE_TYPES.group) {
    const legacyLabel = typeof data.label === 'string'
      ? data.label.trim()
      : '';
    if (legacyLabel) {
      return legacyLabel;
    }
  }

  return getDefaultNodeDisplayName(type, data);
}

export function isNodeUsingDefaultDisplayName(
  type: CanvasConnectionNodeType,
  data: CanvasNodeDisplayData,
): boolean {
  const customTitle = typeof data.displayName === 'string' ? data.displayName.trim() : '';
  if (!customTitle) {
    return true;
  }
  return customTitle === getDefaultNodeDisplayName(type, data);
}
