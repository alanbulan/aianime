// Copyright (c) 2026 AI anime

export interface NodeActionToolbarShellFacts<TVideoData, TAudioData> {
  isGroup: boolean;
  isProtectedProjectionGroup: boolean;
  isStoryboardGroup: boolean;
  isImageEdit: boolean;
  videoData: TVideoData | null;
  audioData: TAudioData | null;
  groupBackgroundColor?: string | null;
  isPresetLocked: boolean;
}

export interface NodeActionToolbarShellProjection<TVideoData, TAudioData> {
  isStoryboardGroup: boolean;
  isImageEdit: boolean;
  videoData: TVideoData | null;
  audioData: TAudioData | null;
  isUngroupableGroup: boolean;
  groupBackgroundColor: string | null;
  isPresetLocked: boolean;
}

export function projectNodeActionToolbarShell<TVideoData, TAudioData>(
  facts: NodeActionToolbarShellFacts<TVideoData, TAudioData>,
): NodeActionToolbarShellProjection<TVideoData, TAudioData> {
  return {
    isStoryboardGroup: facts.isStoryboardGroup,
    isImageEdit: facts.isImageEdit,
    videoData: facts.videoData,
    audioData: facts.audioData,
    isUngroupableGroup:
      facts.isGroup && !facts.isProtectedProjectionGroup,
    groupBackgroundColor: facts.isGroup
      ? (facts.groupBackgroundColor ?? null)
      : null,
    isPresetLocked: facts.isPresetLocked,
  };
}
