// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import type {
  CanvasNodeData,
  CanvasNodeType,
} from '../domain/canvasNodeData';
import { resolveImageDisplayUrl } from '../domain/imageData';
import {
  buildSeparatedVideoNodeData,
  buildVideoAnalysisStoryNodeData,
  buildVideoUpscaleNodeData,
  projectVideoNodeToolbar,
} from '../domain/videoNodeToolbarModel';
import type { VideoSubtitleEraseMode } from '../domain/videoSubtitleErase';
import type { VideoNodeData } from '../domain/canvasNodeData';

import { downloadUrlAsFile } from "@/lib/browserDownload";

export interface VideoNodeToolbarStore {
  addNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    data?: Partial<CanvasNodeData>,
  ) => string;
  addEdge: (source: string, target: string) => string | null;
  findNodePosition: (
    sourceNodeId: string,
    width: number,
    height: number,
  ) => { x: number; y: number };
  onNodesChange: (changes: Array<{
    id: string;
    type: 'select';
    selected: boolean;
  }>) => void;
  setSelectedNode: (id: string | null) => void;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
}

export type VideoNodeToolbarStoreHook = <TSelected>(
  selector: (state: VideoNodeToolbarStore) => TSelected,
) => TSelected;

export interface VideoNodeToolbarEventPort {
  publish: (
    event: 'video-viewer/open',
    payload: { videoUrl: string; title: string | undefined },
  ) => void;
}

export type VideoNodeAnalyzeStory = (params: {
  projectId: string;
  videoUrl: string;
  durationMs?: number | null;
}) => Promise<{
  rawResult: unknown;
  rows: unknown[];
}>;

export type VideoNodeSeparateAudioVideo = (params: {
  projectId: string;
  sourceUrl: string;
}) => Promise<{
  audioUrl: string | null;
  silentVideoUrl: string | null;
  resultFallbackError?: unknown;
}>;

export interface VideoNodeToolbarControllerOptions {
  projectId: string;
  nodeId: string;
  data: VideoNodeData;
}

export function createUseVideoNodeToolbarController({
  useStore,
  eventPort,
  analyzeCanvasVideoStory,
  separateCanvasAudioVideo,
}: {
  useStore: VideoNodeToolbarStoreHook;
  eventPort: VideoNodeToolbarEventPort;
  analyzeCanvasVideoStory: VideoNodeAnalyzeStory;
  separateCanvasAudioVideo: VideoNodeSeparateAudioVideo;
}) {
  return function useVideoNodeToolbarController({
    projectId,
    nodeId,
    data,
  }: VideoNodeToolbarControllerOptions) {
    const { t } = useTranslation();
    const addNode = useStore((state) => state.addNode);
    const addEdge = useStore((state) => state.addEdge);
    const findNodePosition = useStore((state) => state.findNodePosition);
    const onNodesChange = useStore((state) => state.onNodesChange);
    const setSelectedNode = useStore((state) => state.setSelectedNode);
    const updateNodeData = useStore((state) => state.updateNodeData);
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
      eventPort.publish("video-viewer/open", {
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
  };
}

export type VideoNodeToolbarController = ReturnType<
  ReturnType<typeof createUseVideoNodeToolbarController>
>;
