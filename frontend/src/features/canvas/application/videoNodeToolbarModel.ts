// Copyright (c) 2026 AI anime
import type {
  AudioNodeData,
  VideoNodeData,
  VideoStoryNodeData,
} from "@/features/canvas/domain/canvasNodes";

export interface VideoNodeToolbarProjection {
  videoUrl: string | null;
  hasVideo: boolean;
  isAnalyzing: boolean;
  isSeparatingAudioVideo: boolean;
  downloadFilename: string;
  viewerTitle: string | undefined;
}

export interface SeparatedVideoNodeData {
  audio: Partial<AudioNodeData>;
  silentVideo: Partial<VideoNodeData>;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function projectVideoNodeToolbar(
  nodeId: string,
  data: VideoNodeData,
): VideoNodeToolbarProjection {
  const videoUrl = typeof data.videoUrl === "string" ? data.videoUrl : null;
  const downloadFilename = isNonBlankString(data.sourceFileName)
    ? data.sourceFileName
    : isNonBlankString(data.displayName)
      ? `${data.displayName}.mp4`
      : `video-${nodeId}.mp4`;

  return {
    videoUrl,
    hasVideo: Boolean(videoUrl),
    isAnalyzing: Boolean(data.isAnalyzing),
    isSeparatingAudioVideo: Boolean(data.isSeparatingAv),
    downloadFilename,
    viewerTitle:
      typeof data.displayName === "string" ? data.displayName : undefined,
  };
}

export function buildVideoAnalysisStoryNodeData(
  sourceVideoUrl: string,
  analysisStartedAt: number,
): VideoStoryNodeData {
  return {
    sourceVideoUrl,
    rows: [],
    rawResult: null,
    isAnalyzing: true,
    analysisStartedAt,
    analysisError: null,
  };
}

export function buildVideoUpscaleNodeData(
  source: VideoNodeData,
  sourceVideoUrl: string,
  displayName: string,
): Partial<VideoNodeData> {
  return {
    displayName,
    videoUrl: null,
    previewImageUrl:
      typeof source.previewImageUrl === "string"
        ? source.previewImageUrl
        : null,
    aspectRatio:
      typeof source.aspectRatio === "string" ? source.aspectRatio : "16:9",
    isUpscaleNode: true,
    upscaleSourceUrl: sourceVideoUrl,
    upscaleResolution: "1080p",
    upscaleDenoise: "1x",
    isGenerating: false,
  };
}

export function buildSeparatedVideoNodeData(
  source: VideoNodeData,
  audioUrl: string,
  silentVideoUrl: string,
): SeparatedVideoNodeData {
  const rawName = isNonBlankString(source.sourceFileName)
    ? source.sourceFileName
    : isNonBlankString(source.displayName)
      ? source.displayName
      : "video";
  const baseName = rawName.replace(/\.[^/.]+$/, "");
  const audioTitle = `${baseName}_背景音`;
  const silentVideoTitle = `${baseName}_无声`;

  return {
    audio: {
      audioUrl,
      sourceFileName: audioTitle,
      displayName: audioTitle,
    },
    silentVideo: {
      videoUrl: silentVideoUrl,
      sourceFileName: `${silentVideoTitle}.mp4`,
      displayName: silentVideoTitle,
    },
  };
}
