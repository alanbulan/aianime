// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  type CanvasNodeData,
  type CanvasNodeType,
} from "./canvasNodes";
import {
  CANVAS_ASSET_DRAG_MIME,
  coercePushTarget,
  parseCanvasAssetDragPayload,
  type CanvasAssetDragPayload,
} from "@/modules/creative_canvas/public";

export interface CanvasAssetNodeSpawnPort {
  addNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    data: Partial<CanvasNodeData>,
  ) => string;
}

/**
 * 在指定坐标按 payload 类型生成画布节点,返回新节点 id。
 * 「加入」按钮(视口中心)与拖拽落点共用同一套节点构造,避免两处分叉。
 * 注意:此函数只负责建节点,聚焦 / 选中由调用方决定(按钮聚焦、拖放选中)。
 */
export function spawnAssetNode(
  nodeSpawner: CanvasAssetNodeSpawnPort,
  payload: CanvasAssetDragPayload,
  position: { x: number; y: number },
): string {
  const mainlineData =
    payload.mainlineContext && payload.mainlineContext.length
      ? { mainline_context: payload.mainlineContext }
      : {};
  const sourceMeta = { ...payload.source };
  const slotTarget = coercePushTarget(sourceMeta.slot_target);
  const slotData = slotTarget
    ? { slot_target: slotTarget, committed_slot_url: payload.url }
    : {};
  const directorControlBundle =
    sourceMeta.director_control_bundle && typeof sourceMeta.director_control_bundle === "object"
      ? { director_control_bundle: sourceMeta.director_control_bundle }
      : {};
  const candidateData = { user_spawned: true as const };

  switch (payload.kind) {
    case "model": {
      const modelSources = payload.modelSources?.length ? payload.modelSources : undefined;
      const activeSource =
        modelSources?.find((source) => source.id && source.id === payload.activeSourceId) ??
        modelSources?.find((source) => source.current) ??
        modelSources?.[0];
      const activePlyUrl =
        activeSource?.ply_url ??
        (activeSource?.source_type === "sog" ? activeSource.url : undefined);
      const activePanoUrl =
        activeSource?.pano_url ??
        (activeSource?.source_type === "pano360" ? activeSource.url : undefined);
      const plyUrl = payload.plyUrl ?? activePlyUrl ?? (modelSources ? null : payload.url);
      const panoUrl = payload.panoUrl ?? activePanoUrl ?? null;
      return nodeSpawner.addNode(
        CANVAS_NODE_TYPES.threeDWorld,
        position,
        {
          displayName: payload.label,
          plyUrl,
          panoUrl,
          sources: modelSources,
          activeSourceId: payload.activeSourceId ?? activeSource?.id ?? null,
          scene: payload.scene ?? null,
          scenesBySourceId: payload.scenesBySourceId,
          previewImageUrl: payload.coverUrl ?? null,
          sourceFileName: payload.sourceFileName ?? payload.label,
          __freezone_source: sourceMeta,
          ...candidateData,
          ...directorControlBundle,
          ...mainlineData,
          ...slotData,
        } as Record<string, unknown> as Partial<CanvasNodeData>,
      );
    }
    case "video":
      return nodeSpawner.addNode(
        CANVAS_NODE_TYPES.video,
        position,
        {
          displayName: payload.label,
          videoUrl: payload.url,
          previewImageUrl: null,
          aspectRatio: payload.aspectRatio,
          sourceFileName: payload.label,
          // 历史「使用」带来了该记录的原始提示词时,回填到视频节点的提示词框;
          // 无提示词(拖拽/live-canvas)则不写,保持占位符。
          ...(payload.prompt ? { prompt: payload.prompt } : {}),
          // 历史「使用」带来了原始注册表模型 / 生成模式时回填,让还原的视频节点与原次
          // 生成一致(VideoNode 读 data.model / data.genMode);缺省则不写,走节点默认。
          ...(payload.model ? { model: payload.model } : {}),
          ...(payload.genMode ? { genMode: payload.genMode } : {}),
          __freezone_source: sourceMeta,
          ...candidateData,
          ...directorControlBundle,
          ...mainlineData,
          ...slotData,
        } as Record<string, unknown> as Partial<CanvasNodeData>,
      );
    case "audio":
      return nodeSpawner.addNode(
        CANVAS_NODE_TYPES.audio,
        position,
        {
          displayName: payload.label,
          audioUrl: payload.url,
          sourceFileName: payload.label,
          __freezone_source: sourceMeta,
          ...candidateData,
          ...directorControlBundle,
          ...mainlineData,
          ...slotData,
        } as Record<string, unknown> as Partial<CanvasNodeData>,
      );
    case "image":
    default:
      // 历史「使用」还原生成产物 → 建成品「图片节点」(imageGen):带回提示词与操作区,
      // onLoad 按图片自然尺寸自适应比例并显示分辨率角标(见 ImageGenNode)。写入
      // committed_* 使其与生成完成后落地的节点字段一致(成品图直接展示、可继续再生成)。
      // 普通拖拽 / 素材库参考图(无此标记)仍建 upload 节点(替换素材)。
      if (payload.restoreAsGeneratedImage) {
        return nodeSpawner.addNode(
          CANVAS_NODE_TYPES.imageGen,
          position,
          {
            displayName: payload.label,
            imageUrl: payload.url,
            previewImageUrl: payload.url,
            committed_at: new Date().toISOString(),
            committed_slot_url: payload.url,
            ...(payload.prompt ? { prompt: payload.prompt } : {}),
            // 历史「使用」带来原始注册表模型 id 时回填,让还原的成品图片节点与原次生成
            // 同模型(ImageGenNode 读 data.model);缺省则不写,节点自行 seed 默认模型。
            ...(payload.model ? { model: payload.model } : {}),
            __freezone_source: sourceMeta,
            ...candidateData,
            ...directorControlBundle,
            ...mainlineData,
            ...slotData,
          } as Record<string, unknown> as Partial<CanvasNodeData>,
        );
      }
      return nodeSpawner.addNode(
        CANVAS_NODE_TYPES.upload,
        position,
        {
          displayName: payload.label,
          imageUrl: payload.url,
          previewImageUrl: payload.url,
          aspectRatio: payload.aspectRatio,
          sourceFileName: payload.label,
          __freezone_source: sourceMeta,
          ...candidateData,
          ...directorControlBundle,
          ...mainlineData,
          ...slotData,
        } as Record<string, unknown> as Partial<CanvasNodeData>,
      );
  }
}

/** 从 dataTransfer 解析素材拖拽 payload;非素材拖拽返回 null。 */
export function readAssetDragPayload(
  dataTransfer: DataTransfer,
): CanvasAssetDragPayload | null {
  return parseCanvasAssetDragPayload(
    dataTransfer.getData(CANVAS_ASSET_DRAG_MIME),
  );
}
