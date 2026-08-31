// Copyright (c) 2026 AI anime
import { CANVAS_NODE_TYPES } from './canvasConnection';
import type {
  AudioNodeData,
  BeatContextNodeData,
  CanvasNodeData,
  CanvasNodeType,
  ExportImageNodeData,
  GroupNodeData,
  ImageEditNodeData,
  ImageGenNodeData,
  Pano360ViewerNodeData,
  ScriptNodeData,
  SkillNodeData,
  StoryboardGenNodeData,
  StoryboardSplitNodeData,
  StyleNodeData,
  TextAnnotationNodeData,
  ThreeDWorldNodeData,
  UploadImageNodeData,
  VideoComposeNodeData,
  VideoNodeData,
  VideoStoryNodeData,
} from './canvasNodeData';
import { AUTO_REQUEST_ASPECT_RATIO, DEFAULT_ASPECT_RATIO } from './aspectRatio';
import type { ImageSize } from './imageNodeSizing';
import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_SHARED_MODEL_ID,
  DEFAULT_VIDEO_MODEL_ID,
} from './modelDefaults';
import { DEFAULT_NODE_DISPLAY_NAME } from './nodeDisplay';
import { SKILL_SCHEMA_VERSION } from './skillContract';
type MenuIconKey = 'upload' | 'sparkles' | 'layout' | 'text' | 'video' | 'audio' | 'script' | 'pano360' | 'threeDWorld' | 'videoCompose';

interface CanvasNodeCapabilities {
  toolbar: boolean;
  promptInput: boolean;
}

export interface CanvasNodeDefinition<TData extends CanvasNodeData = CanvasNodeData> {
  type: CanvasNodeType;
  menuLabelKey: string;
  menuIcon: MenuIconKey;
  visibleInMenu: boolean;
  capabilities: CanvasNodeCapabilities;
  createDefaultData: () => TData;
}

const uploadNodeDefinition: CanvasNodeDefinition<UploadImageNodeData> = {
  type: CANVAS_NODE_TYPES.upload,
  menuLabelKey: 'node.menu.uploadImage',
  menuIcon: 'upload',
  visibleInMenu: true,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.upload],
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: '1:1',
    isSizeManuallyAdjusted: false,
    sourceFileName: null,
  }),
};

const imageEditNodeDefinition: CanvasNodeDefinition<ImageEditNodeData> = {
  type: CANVAS_NODE_TYPES.imageEdit,
  menuLabelKey: 'node.menu.aiImageGeneration',
  menuIcon: 'sparkles',
  visibleInMenu: false,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.imageEdit],
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    isSizeManuallyAdjusted: false,
    requestAspectRatio: AUTO_REQUEST_ASPECT_RATIO,
    prompt: '',
    model: DEFAULT_IMAGE_MODEL_ID,
    size: '2K' as ImageSize,
    extraParams: {},
    generationMode: 'text_to_image',
    isGenerating: false,
    generationStartedAt: null,
    generationDurationMs: 60000,
  }),
};

const imageGenNodeDefinition: CanvasNodeDefinition<ImageGenNodeData> = {
  type: CANVAS_NODE_TYPES.imageGen,
  menuLabelKey: 'node.menu.image',
  menuIcon: 'sparkles',
  visibleInMenu: true,
  capabilities: {
    toolbar: false,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.imageGen],
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: '16:9',
    isSizeManuallyAdjusted: false,
    requestAspectRatio: AUTO_REQUEST_ASPECT_RATIO,
    prompt: '',
    model: DEFAULT_SHARED_MODEL_ID,
    size: '2K' as ImageSize,
    count: 1,
    styleTemplateId: null,
    focusRegion: null,
    cameraSelection: null,
    referenceImageUrl: null,
    marks: [],
    isGenerating: false,
    generationStartedAt: null,
    generationDurationMs: 60000,
  }),
};

const exportImageNodeDefinition: CanvasNodeDefinition<ExportImageNodeData> = {
  type: CANVAS_NODE_TYPES.exportImage,
  menuLabelKey: 'node.menu.uploadImage',
  menuIcon: 'upload',
  visibleInMenu: false,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.exportImage],
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    isSizeManuallyAdjusted: false,
    resultKind: 'generic',
  }),
};

const beatContextNodeDefinition: CanvasNodeDefinition<BeatContextNodeData> = {
  type: CANVAS_NODE_TYPES.beatContext,
  menuLabelKey: 'node.menu.beatContext',
  menuIcon: 'text',
  visibleInMenu: true,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.beatContext],
    content: '',
    context_scope: 'standalone',
    beat_context: {
      schema: 'beat_context.v1',
      source: 'standalone',
      title: '自定义镜头上下文',
      visual_description: '',
      narration_segment: '',
      scene_id: '',
      time_of_day: '',
      detected_identities: [],
      detected_props: [],
      sketch_colors: {},
      prop_marker_colors: {},
    },
    snapshot: {
      visualDescription: '',
      narrationSegment: '',
      sceneId: '',
      timeOfDay: '',
      detectedIdentities: [],
      detectedProps: [],
      sketchColors: {},
      propMarkerColors: {},
    },
    syncStatus: 'fresh',
  }),
};

const groupNodeDefinition: CanvasNodeDefinition<GroupNodeData> = {
  type: CANVAS_NODE_TYPES.group,
  menuLabelKey: 'node.menu.storyboard',
  menuIcon: 'layout',
  visibleInMenu: false,
  capabilities: {
    toolbar: false,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.group],
    label: '组',
  }),
};

const textAnnotationNodeDefinition: CanvasNodeDefinition<TextAnnotationNodeData> = {
  type: CANVAS_NODE_TYPES.textAnnotation,
  menuLabelKey: 'node.menu.textAnnotation',
  menuIcon: 'text',
  visibleInMenu: true,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.textAnnotation],
    content: '',
    model: DEFAULT_SHARED_MODEL_ID,
    extraParams: {},
    isGenerating: false,
  }),
};

const storyboardSplitDefinition: CanvasNodeDefinition<StoryboardSplitNodeData> = {
  type: CANVAS_NODE_TYPES.storyboardSplit,
  menuLabelKey: 'node.menu.storyboard',
  menuIcon: 'layout',
  visibleInMenu: false,
  capabilities: {
    toolbar: false,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.storyboardSplit],
    aspectRatio: DEFAULT_ASPECT_RATIO,
    frameAspectRatio: DEFAULT_ASPECT_RATIO,
    gridRows: 2,
    gridCols: 2,
    frames: [],
    exportOptions: {
      showFrameIndex: false,
      showFrameNote: false,
      notePlacement: 'overlay',
      imageFit: 'cover',
      frameIndexPrefix: 'S',
      cellGap: 8,
      outerPadding: 0,
      fontSize: 4,
      backgroundColor: '#0f1115',
      textColor: '#f8fafc',
    },
  }),
};

const storyboardGenNodeDefinition: CanvasNodeDefinition<StoryboardGenNodeData> = {
  type: CANVAS_NODE_TYPES.storyboardGen,
  menuLabelKey: 'node.menu.storyboardGen',
  menuIcon: 'sparkles',
  visibleInMenu: true,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.storyboardGen],
    gridRows: 2,
    gridCols: 2,
    frames: [],
    ratioControlMode: 'cell',
    model: DEFAULT_IMAGE_MODEL_ID,
    size: '2K' as ImageSize,
    requestAspectRatio: AUTO_REQUEST_ASPECT_RATIO,
    extraParams: {},
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    isGenerating: false,
    generationStartedAt: null,
    generationDurationMs: 60000,
  }),
};

const videoNodeDefinition: CanvasNodeDefinition<VideoNodeData> = {
  type: CANVAS_NODE_TYPES.video,
  menuLabelKey: 'node.menu.video',
  menuIcon: 'video',
  visibleInMenu: true,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.video],
    videoUrl: null,
    previewImageUrl: null,
    aspectRatio: '16:9',
    isSizeManuallyAdjusted: false,
    sourceFileName: null,
    widthPx: null,
    heightPx: null,
    durationMs: null,
    isUploading: false,
    isAnalyzing: false,
    analysisResult: null,
    analysisError: null,
    // generation panel defaults
    prompt: '',
    genMode: 'textToVideo',
    model: DEFAULT_VIDEO_MODEL_ID,
    quality: '720P',
    durationSec: 5,
    generateAudio: true,
    count: 1,
    isGenerating: false,
    generationStartedAt: null,
    generationDurationMs: 60000,
  }),
};

const audioNodeDefinition: CanvasNodeDefinition<AudioNodeData> = {
  type: CANVAS_NODE_TYPES.audio,
  menuLabelKey: 'node.menu.audio',
  menuIcon: 'audio',
  visibleInMenu: true,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.audio],
    audioUrl: null,
    sourceFileName: null,
    durationMs: null,
    isUploading: false,
    text: '',
    emotionPrompt: '',
    // 默认音色：留空。AudioOperationsPanel 挂载时会拉一次音色库
    // references 并落到第一个；这里硬编码 project_narrator 会让初始化
    // effect 提前 bail，导致用户始终看到"项目解说人"无法替换。
    voiceLanguage: '',
    isGenerating: false,
    generationStartedAt: null,
  }),
};

const videoStoryNodeDefinition: CanvasNodeDefinition<VideoStoryNodeData> = {
  type: CANVAS_NODE_TYPES.videoStory,
  menuLabelKey: 'node.menu.videoStory',
  menuIcon: 'video',
  // Only ever spawned programmatically (after video-analyze success), never
  // through the double-click or "+" menus.
  visibleInMenu: false,
  capabilities: {
    toolbar: false,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.videoStory],
    sourceVideoUrl: null,
    rows: [],
    rawResult: null,
    isAnalyzing: false,
    analysisError: null,
  }),
};

const videoComposeNodeDefinition: CanvasNodeDefinition<VideoComposeNodeData> = {
  type: CANVAS_NODE_TYPES.videoCompose,
  menuLabelKey: 'node.menu.videoCompose',
  menuIcon: 'videoCompose',
  visibleInMenu: true,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.videoCompose],
    resultVideoUrl: null,
    previewImageUrl: null,
    resolution: '1080p',
  }),
};

const scriptNodeDefinition: CanvasNodeDefinition<ScriptNodeData> = {
  type: CANVAS_NODE_TYPES.script,
  menuLabelKey: 'node.menu.script',
  menuIcon: 'script',
  visibleInMenu: true,
  capabilities: {
    toolbar: false,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.script],
    prompt: '',
    model: DEFAULT_SHARED_MODEL_ID,
    lastAction: null,
    scriptResult: null,
    isGenerating: false,
    generationStartedAt: null,
    generationDurationMs: 60000,
  }),
};

const pano360ViewerNodeDefinition: CanvasNodeDefinition<Pano360ViewerNodeData> = {
  type: CANVAS_NODE_TYPES.pano360Viewer,
  menuLabelKey: 'node.menu.pano360Viewer',
  menuIcon: 'pano360',
  visibleInMenu: true,
  capabilities: {
    toolbar: false,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.pano360Viewer],
    imageUrl: null,
    previewImageUrl: null,
    sourceNodeId: null,
    sphereCorrectionDeg: { roll: 0, pitch: 0, yaw: 0 },
    frontYawDeg: 0,
    fovDeg: 70,
    lastExportedEntry: null,
  }),
};

const threeDWorldNodeDefinition: CanvasNodeDefinition<ThreeDWorldNodeData> = {
  type: CANVAS_NODE_TYPES.threeDWorld,
  menuLabelKey: 'node.menu.threeDWorld',
  menuIcon: 'threeDWorld',
  visibleInMenu: true,
  capabilities: {
    toolbar: false,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.threeDWorld],
    prompt: '',
    taskKey: null,
    plyUrl: null,
    sourceNodeId: null,
    sourceKind: null,
    isGenerating: false,
    generationStartedAt: null,
    generationDurationMs: 90000,
    errorMessage: null,
  }),
};

const skillNodeDefinition: CanvasNodeDefinition<SkillNodeData> = {
  type: CANVAS_NODE_TYPES.skill,
  menuLabelKey: 'node.menu.skill',
  menuIcon: 'sparkles',
  visibleInMenu: false,
  capabilities: {
    toolbar: false,
    promptInput: false,
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.skill],
    skill_id: '',
    skill_schema_version: SKILL_SCHEMA_VERSION,
  }),
};

// 风格节点由图片节点的对账逻辑维护，不进入创建菜单。默认不写 displayName，标题
// 才能随当前风格的分类和名称变化；用户手工改名后再以 displayName 为准。
const styleNodeDefinition: CanvasNodeDefinition<StyleNodeData> = {
  type: CANVAS_NODE_TYPES.style,
  menuLabelKey: 'node.menu.style',
  menuIcon: 'sparkles',
  visibleInMenu: false,
  capabilities: {
    toolbar: false,
    promptInput: false,
  },
  createDefaultData: () => ({
    styleTemplateId: null,
  }),
};

export const canvasNodeDefinitions: Record<CanvasNodeType, CanvasNodeDefinition> = {
  [CANVAS_NODE_TYPES.upload]: uploadNodeDefinition,
  [CANVAS_NODE_TYPES.imageEdit]: imageEditNodeDefinition,
  [CANVAS_NODE_TYPES.imageGen]: imageGenNodeDefinition,
  [CANVAS_NODE_TYPES.exportImage]: exportImageNodeDefinition,
  [CANVAS_NODE_TYPES.beatContext]: beatContextNodeDefinition,
  [CANVAS_NODE_TYPES.textAnnotation]: textAnnotationNodeDefinition,
  [CANVAS_NODE_TYPES.group]: groupNodeDefinition,
  [CANVAS_NODE_TYPES.storyboardSplit]: storyboardSplitDefinition,
  [CANVAS_NODE_TYPES.storyboardGen]: storyboardGenNodeDefinition,
  [CANVAS_NODE_TYPES.video]: videoNodeDefinition,
  [CANVAS_NODE_TYPES.audio]: audioNodeDefinition,
  [CANVAS_NODE_TYPES.videoStory]: videoStoryNodeDefinition,
  [CANVAS_NODE_TYPES.videoCompose]: videoComposeNodeDefinition,
  [CANVAS_NODE_TYPES.script]: scriptNodeDefinition,
  [CANVAS_NODE_TYPES.pano360Viewer]: pano360ViewerNodeDefinition,
  [CANVAS_NODE_TYPES.threeDWorld]: threeDWorldNodeDefinition,
  [CANVAS_NODE_TYPES.skill]: skillNodeDefinition,
  [CANVAS_NODE_TYPES.style]: styleNodeDefinition,
};

export function getNodeDefinition(type: CanvasNodeType): CanvasNodeDefinition {
  return canvasNodeDefinitions[type];
}

export function getMenuNodeDefinitions(): CanvasNodeDefinition[] {
  return Object.values(canvasNodeDefinitions).filter((definition) => definition.visibleInMenu);
}
