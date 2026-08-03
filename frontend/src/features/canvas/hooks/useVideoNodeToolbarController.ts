// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useCanvasStore } from "@/features/canvas/canvasStore";
import {
  analyzeCanvasVideoStory,
  buildSeparatedVideoNodeData,
  buildVideoAnalysisStoryNodeData,
  buildVideoUpscaleNodeData,
  canvasEventBus,
  projectVideoNodeToolbar,
  separateCanvasAudioVideo,
  type VideoSubtitleEraseMode,
  resolveImageDisplayUrl,
} from "@/modules/creative_canvas/public";
import {
  CANVAS_NODE_TYPES,
  type VideoNodeData,
} from "@/features/canvas/domain/canvasNodes";
import { downloadUrlAsFile } from "@/lib/browserDownload";

export interface VideoNodeToolbarControllerOptions {
  projectId: string;
  nodeId: string;
  data: VideoNodeData;
}

export function useVideoNodeToolbarController({
  projectId,
  nodeId,
  data,
}: VideoNodeToolbarControllerOptions) {
  const { t } = useTranslation();
  const addNode = useCanvasStore((state) => state.addNode);
  const addEdge = useCanvasStore((state) => state.addEdge);
  const findNodePosition = useCanvasStore((state) => state.findNodePosition);
  const onNodesChange = useCanvasStore((state) => state.onNodesChange);
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const projection = useMemo(
    () => projectVideoNodeToolbar(nodeId, data),
    [data, nodeId],
  );

  const toggleClipMode = useCallback(() => {
    if (!projection.hasVideo) return;
    updateNodeData(nodeId, { isClipMode: !data.isClipMode });
  }, [data.isClipMode, nodeId, projection.hasVideo, updateNodeData]);

  const openSubtitleRemoval = useCallback(
    (mode: VideoSubtitleEraseMode) => {
      if (!projection.hasVideo) {
        console.info(
          `[video-toolbar] stub action triggered: subtitle-${mode}-erase`,
        );
        return;
      }
      updateNodeData(nodeId, {
        subtitleEraseMode: mode,
        subtitleEraseBox: null,
        isClipMode: false,
      });
      setSelectedNode(nodeId);
    },
    [nodeId, projection.hasVideo, setSelectedNode, updateNodeData],
  );

  const analyze = useCallback(async () => {
    const { hasVideo, isAnalyzing, videoUrl } = projection;
    if (!hasVideo || !videoUrl || isAnalyzing) return;

    updateNodeData(nodeId, {
      isAnalyzing: true,
      analysisError: null,
    });

    const storyNodeId = addNode(
      CANVAS_NODE_TYPES.videoStory,
      findNodePosition(nodeId, 720, 360),
      buildVideoAnalysisStoryNodeData(videoUrl, Date.now()),
    );
    addEdge(nodeId, storyNodeId);

    try {
      const { rawResult, rows } = await analyzeCanvasVideoStory({
        projectId,
        videoUrl,
        durationMs: data.durationMs,
      });
      console.info("[video-analyze] normalized rows", rows.length, rows);
      updateNodeData(storyNodeId, {
        rows,
        rawResult,
        isAnalyzing: false,
        analysisError: null,
      });
      updateNodeData(nodeId, {
        isAnalyzing: false,
        analysisError: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[video-analyze] failed", error);
      updateNodeData(storyNodeId, {
        isAnalyzing: false,
        analysisError: message,
      });
      updateNodeData(nodeId, {
        isAnalyzing: false,
        analysisError: message,
      });
    }
  }, [
    addEdge,
    addNode,
    data.durationMs,
    findNodePosition,
    nodeId,
    projectId,
    projection,
    updateNodeData,
  ]);

  const download = useCallback(async () => {
    const { hasVideo, videoUrl } = projection;
    if (!hasVideo || !videoUrl) return;
    try {
      await downloadUrlAsFile(
        resolveImageDisplayUrl(videoUrl),
        projection.downloadFilename,
      );
    } catch (error) {
      console.error("[video-download] failed", error);
    }
  }, [projection]);

  const openFullscreen = useCallback(() => {
    const { hasVideo, videoUrl } = projection;
    if (!hasVideo || !videoUrl) return;
    canvasEventBus.publish("video-viewer/open", {
      videoUrl,
      title: projection.viewerTitle,
    });
  }, [projection]);

  const createUpscaleNode = useCallback(() => {
    const { hasVideo, videoUrl } = projection;
    if (!hasVideo || !videoUrl) return;

    const upscaleNodeId = addNode(
      CANVAS_NODE_TYPES.video,
      findNodePosition(nodeId, 580, 380),
      buildVideoUpscaleNodeData(
        data,
        videoUrl,
        `${t("node.videoUpscale.nodeTitle")}（1080P）`,
      ),
    );
    addEdge(nodeId, upscaleNodeId);
    onNodesChange([
      { id: nodeId, type: "select", selected: false },
      { id: upscaleNodeId, type: "select", selected: true },
    ]);
    setSelectedNode(upscaleNodeId);
  }, [
    addEdge,
    addNode,
    data,
    findNodePosition,
    nodeId,
    onNodesChange,
    projection,
    setSelectedNode,
    t,
  ]);

  const separateAudioVideo = useCallback(async () => {
    const { hasVideo, isSeparatingAudioVideo, videoUrl } = projection;
    if (!hasVideo || !videoUrl || isSeparatingAudioVideo) return;

    updateNodeData(nodeId, { isSeparatingAv: true });
    try {
      const {
        audioUrl,
        silentVideoUrl,
        resultFallbackError,
      } = await separateCanvasAudioVideo({
        projectId,
        sourceUrl: videoUrl,
      });
      if (resultFallbackError) {
        console.warn(
          "[audio-separate] job result fetch failed",
          resultFallbackError,
        );
      }
      if (!audioUrl || !silentVideoUrl) {
        console.warn("[audio-separate] could not resolve audio/video urls", {
          audioOutputUrl: audioUrl,
          silentVideoOutputUrl: silentVideoUrl,
        });
        return;
      }
      console.info("[audio-separate] resolved urls", {
        audioOutputUrl: audioUrl,
        silentVideoOutputUrl: silentVideoUrl,
      });
      const separated = buildSeparatedVideoNodeData(
        data,
        audioUrl,
        silentVideoUrl,
      );
      const audioNodeId = addNode(
        CANVAS_NODE_TYPES.audio,
        findNodePosition(nodeId, 480, 180),
        separated.audio,
      );
      addEdge(nodeId, audioNodeId);
      const silentVideoNodeId = addNode(
        CANVAS_NODE_TYPES.video,
        findNodePosition(nodeId, 480, 270),
        separated.silentVideo,
      );
      addEdge(nodeId, silentVideoNodeId);
    } catch (error) {
      console.error("[audio-separate] failed", error);
    } finally {
      updateNodeData(nodeId, { isSeparatingAv: false });
    }
  }, [
    addEdge,
    addNode,
    data,
    findNodePosition,
    nodeId,
    projectId,
    projection,
    updateNodeData,
  ]);

  return {
    ...projection,
    t,
    toggleClipMode,
    openSubtitleRemoval,
    analyze,
    download,
    openFullscreen,
    createUpscaleNode,
    separateAudioVideo,
  };
}

export type VideoNodeToolbarController = ReturnType<
  typeof useVideoNodeToolbarController
>;
