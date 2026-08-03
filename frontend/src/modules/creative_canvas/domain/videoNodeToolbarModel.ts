// Copyright (c) 2026 AI anime

export interface VideoNodeToolbarData extends Record<string, unknown> {
  videoUrl?: string | null;
  sourceFileName?: string | null;
  displayName?: string;
  isAnalyzing?: boolean;
  isSeparatingAv?: boolean;
  previewImageUrl?: string | null;
  aspectRatio?: string;
}

export interface VideoAnalysisStoryNodeData extends Record<string, unknown> {
  sourceVideoUrl: string;
  rows: unknown[];
  rawResult: null;
  isAnalyzing: true;
  analysisStartedAt: number;
  analysisError: null;
}

export interface VideoToolbarNodePatch extends Record<string, unknown> {
  displayName?: string;
  videoUrl?: string | null;
  audioUrl?: string | null;
  sourceFileName?: string | null;
  previewImageUrl?: string | null;
  aspectRatio?: string;
  isUpscaleNode?: boolean;
  upscaleSourceUrl?: string;
  upscaleResolution?: "1080p";
  upscaleDenoise?: "1x";
  isGenerating?: boolean;
}

export interface VideoNodeToolbarProjection {
  videoUrl: string | null;
  hasVideo: boolean;
  isAnalyzing: boolean;
  isSeparatingAudioVideo: boolean;
  downloadFilename: string;
  viewerTitle: string | undefined;
}

export interface SeparatedVideoNodeData {
  audio: VideoToolbarNodePatch;
  silentVideo: VideoToolbarNodePatch;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function projectVideoNodeToolbar(
  nodeId: string,
  data: VideoNodeToolbarData,
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
): VideoAnalysisStoryNodeData {
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
  source: VideoNodeToolbarData,
  sourceVideoUrl: string,
  displayName: string,
): VideoToolbarNodePatch {
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
  source: VideoNodeToolbarData,
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
