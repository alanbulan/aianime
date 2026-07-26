// Copyright (c) 2026 AI anime
import type { XYPosition } from '@xyflow/react';

import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  NodeToolType,
  StoryboardFrameItem,
} from '../domain/canvasNodes';
import type { CanvasNodeDefinition } from '../domain/nodeRegistry';
import type {
  CanvasRedrawAspectRatio,
  CanvasRedrawImageSize,
} from '../domain/redraw';

export interface IdGenerator {
  next: () => string;
}

export interface CanvasAssetUploadOptions {
  disableTimeout?: boolean;
}

export interface CanvasAssetUploadResult {
  readonly url: string;
  readonly filename: string;
  readonly size: number;
}

export interface CanvasAssetGateway {
  upload: (
    projectId: string,
    file: File | Blob,
    filename: string,
    options?: CanvasAssetUploadOptions,
  ) => Promise<CanvasAssetUploadResult>;
}

export interface CanvasAssetSourceReadOptions {
  includeCredentials?: boolean;
}

export interface CanvasAssetSourceGateway {
  read: (
    source: string,
    options?: CanvasAssetSourceReadOptions,
  ) => Promise<Blob>;
}

export interface CanvasGraphSnapshot {
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
}

export interface CanvasGraphGateway {
  getSnapshot: () => CanvasGraphSnapshot;
  addNode: (
    type: CanvasNodeType,
    position: XYPosition,
    data?: Partial<CanvasNodeData>,
  ) => string | null;
  addEdgeWithData: (
    source: string,
    target: string,
    data: Record<string, unknown>,
    options?: {
      id?: string;
      sourceHandle?: string;
      targetHandle?: string;
    },
  ) => string | null;
  updateNodeData: (
    nodeId: string,
    data: Partial<CanvasNodeData>,
  ) => void;
}

export interface GenerationRuntimeDiagnostics {
  appVersion: string;
  osName: string;
  osVersion: string;
  osBuild: string;
  userAgent: string;
}

export interface GenerationRuntimeGateway {
  runtimeSessionId: string;
  getRuntimeDiagnostics: () => Promise<GenerationRuntimeDiagnostics>;
}

export interface CanvasGenerationTaskRef {
  job_id: string;
  task_key: string;
  task_type: string;
}

export interface CanvasGenerationTaskCompletion {
  result?: Record<string, unknown> | null;
}

export interface CanvasStoryScriptRow {
  shot_no?: string | number | null;
  duration?: string | number | null;
  visual_description?: string | null;
  character?: string | null;
  shot?: string | null;
  action?: string | null;
  emotion?: string | null;
  scene_tags?: string | null;
  lighting_mood?: string | null;
  sound?: string | null;
  dialogue?: string | null;
  shot_prompt?: string | null;
  video_motion_prompt?: string | null;
  [key: string]: unknown;
}

export interface CanvasStoryScriptResult {
  title?: string | null;
  rows: CanvasStoryScriptRow[];
}

export interface CanvasTaskResultGateway {
  awaitCompletion: (
    taskKey: string,
    projectId: string,
  ) => Promise<CanvasGenerationTaskCompletion>;
  fetchResultUrl: (
    projectId: string,
    taskType: string,
    jobId: string,
  ) => Promise<string>;
}

export interface CanvasGenerationTaskGateway extends CanvasTaskResultGateway {
  hasTask: (projectId: string, taskKey: string) => Promise<boolean>;
  fetchReversePrompt: (
    projectId: string,
    jobId: string,
  ) => Promise<string>;
  fetchStoryScriptResult: (
    projectId: string,
    jobId: string,
  ) => Promise<CanvasStoryScriptResult>;
}

export interface CanvasRedrawCommand {
  aspectRatio: CanvasRedrawAspectRatio;
  imageSize: CanvasRedrawImageSize;
  maskUrl: string | null;
  model?: string;
  prompt?: string;
  sourceUrl: string;
}

export interface CanvasRedrawTaskGateway extends CanvasTaskResultGateway {
  submit: (
    projectId: string,
    command: CanvasRedrawCommand,
  ) => Promise<CanvasGenerationTaskRef>;
}

export interface NodeCatalog {
  getDefinition: (type: CanvasNodeType) => CanvasNodeDefinition;
  getMenuDefinitions: () => CanvasNodeDefinition[];
}

export interface CanvasNodeDefaultDataGateway {
  getOverrides: (type: CanvasNodeType) => Partial<CanvasNodeData>;
}

export interface NodeFactory {
  createNode: (
    type: CanvasNodeType,
    position: XYPosition,
    data?: Partial<CanvasNodeData>
  ) => CanvasNode;
}

export interface GraphImageResolver {
  collectInputImages: (nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]) => string[];
}

/**
 * 单条「上游节点内容」记录。所有可能字段都是可选的，调用方按需取用。
 * `text` 来自任何带 prompt / content 的上游节点，`imageUrl` / `videoUrl` /
 * `audioUrl` 来自素材类节点。
 */
export interface UpstreamContent {
  nodeId: string;
  nodeType: CanvasNodeType;
  displayName?: string;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
}

export interface GraphContentResolver {
  collectInputContents: (
    nodeId: string,
    nodes: CanvasNode[],
    edges: CanvasEdge[]
  ) => UpstreamContent[];
}

export interface GenerateImagePayload {
  prompt: string;
  model: string;
  /** 注册表模型 id（还原用），与后端请求模型串区分。 */
  modelId?: string;
  /** 生成模式（还原用）。 */
  generationMode?: string;
  size: string;
  aspectRatio: string;
  referenceImages?: string[];
  extraParams?: Record<string, unknown>;
  capabilityId?: string;
  /** Triggering node id, forwarded so the backend records per-node history. */
  nodeId?: string;
  capabilityParams?: Record<string, unknown>;
  capabilityInputs?: Record<
    string,
    {
      nodeId?: string;
      role?: string;
      sourceUrl?: string;
      assetKind?: string;
    }
  >;
}

export interface AiGateway {
  setApiKey: (provider: string, apiKey: string) => Promise<void>;
  generateImage: (payload: GenerateImagePayload) => Promise<string>;
  submitGenerateImageJob: (payload: GenerateImagePayload) => Promise<string>;
  getGenerateImageJob: (jobId: string) => Promise<{
    job_id: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'not_found';
    result?: string | null;
    error?: string | null;
  }>;
}

export interface ImageSplitGateway {
  split: (
    imageSource: string,
    rows: number,
    cols: number,
    lineThickness: number
  ) => Promise<string[]>;
}

export interface CanvasImageDimensions {
  width: number;
  height: number;
}

export interface CanvasImagePreviewData extends CanvasImageDimensions {
  normalizedDataUrl: string;
  previewDataUrl: string;
}

export interface CanvasImageRuntimeGateway {
  now: () => number;
  persist: (sourceImage: string) => Promise<string>;
  readFileAsDataUrl: (file: File) => Promise<string>;
  preparePreview: (
    sourceImage: string,
    maxDimension: number,
  ) => Promise<CanvasImagePreviewData>;
  getDimensions: (sourceImage: string) => Promise<CanvasImageDimensions>;
}

export interface CanvasStoryboardImageMetadata {
  gridRows: number;
  gridCols: number;
  frameNotes: string[];
}

export interface CanvasToolImageGateway {
  crop: (
    sourceImage: string,
    options: Record<string, unknown>,
  ) => Promise<string>;
  annotate: (
    sourceImage: string,
    options: Record<string, unknown>,
  ) => Promise<string>;
  persist: (sourceImage: string) => Promise<string>;
  detectAspectRatio: (sourceImage: string) => Promise<string>;
  getDimensions: (sourceImage: string) => Promise<CanvasImageDimensions>;
  splitLocally: (
    sourceImage: string,
    rows: number,
    cols: number,
    lineThickness: number,
  ) => Promise<string[]>;
  readStoryboardMetadata: (
    sourceImage: string,
  ) => Promise<CanvasStoryboardImageMetadata | null>;
}

export interface ToolProcessorResult {
  outputImageUrl?: string;
  storyboardFrames?: StoryboardFrameItem[];
  rows?: number;
  cols?: number;
  frameAspectRatio?: string;
}

export interface ToolProcessor {
  process: (
    toolType: NodeToolType,
    sourceImageUrl: string,
    options: Record<string, unknown>
  ) => Promise<ToolProcessorResult>;
}

export interface CanvasEventMap {
  'tool-dialog/open': {
    nodeId: string;
    toolType: NodeToolType;
  };
  'tool-dialog/close': undefined;
  'upload-node/reupload': {
    nodeId: string;
  };
  'upload-node/paste-image': {
    nodeId: string;
    file: File;
  };
  /** 「上传资源」菜单等外部入口注入 File 给 upload 节点（仅图片）。 */
  'upload-node/external-file': {
    nodeId: string;
    file: File;
  };
  'video-node/reupload': {
    nodeId: string;
  };
  /** 「上传资源」菜单等外部入口注入 File 给 video 节点（仅视频）。 */
  'video-node/external-file': {
    nodeId: string;
    file: File;
  };
  /** 「上传资源」菜单等外部入口注入 File 给 audio 节点（仅音频）。 */
  'audio-node/external-file': {
    nodeId: string;
    file: File;
  };
  'video-viewer/open': {
    videoUrl: string;
    title?: string;
  };
  /**
   * 节点 toolbar 上的 Commit 按钮触发：把该节点的图写回主流程对应 slot。
   * FreezoneShell 监听后查节点、推 CommitDialog；toolbar 只负责发事件。
   */
  'freezone/commit-node': {
    nodeId: string;
    auto?: boolean;
    successMessage?: string;
  };
  /** 投影 group toolbar 触发：刷新该 projection，不让 toolbar 直接改画布状态。 */
  'freezone/projection-sync': {
    projectionKey: string;
  };
  /** 投影 group toolbar 触发：移除该 projection，不走普通 deleteNode。 */
  'freezone/projection-remove': {
    projectionKey: string;
  };
  /** 主线资产已在节点内部直接写入，通知素材库重拉。 */
  'freezone/assets-updated': undefined;
}

export interface CanvasEventBus {
  publish: <TType extends keyof CanvasEventMap>(
    type: TType,
    payload: CanvasEventMap[TType]
  ) => void;
  subscribe: <TType extends keyof CanvasEventMap>(
    type: TType,
    handler: (payload: CanvasEventMap[TType]) => void
  ) => () => void;
}
