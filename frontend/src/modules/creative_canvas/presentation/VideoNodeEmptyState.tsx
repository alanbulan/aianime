// Copyright (c) 2026 AI anime
import { Layers, Play, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface VideoNodeEmptyStateProps {
  isUpscaleNode: boolean;
  isConnected: boolean;
  hasUpstreamVideo: boolean;
  onSpawnFirstLastFrame: () => void;
  onSpawnFirstFrame: () => void;
}

export function VideoNodeEmptyState({
  isUpscaleNode,
  isConnected,
  hasUpstreamVideo,
  onSpawnFirstLastFrame,
  onSpawnFirstFrame,
}: VideoNodeEmptyStateProps) {
  const { t } = useTranslation();

  if (isUpscaleNode) {
    return (
      <div className="flex h-full w-full items-center justify-center px-6">
        <span className="text-center text-sm font-medium text-text-dark/78">
          {t("node.videoUpscale.placeholder")}
        </span>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Play className="h-9 w-9 text-text-muted/46" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center px-8">
      {!hasUpstreamVideo && (
        <div className="flex min-h-0 flex-col justify-center gap-2 py-4">
          <div className="text-xs text-[var(--canvas-node-input-helper)]">
            试试：
          </div>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSpawnFirstLastFrame();
              }}
              className="nodrag -mx-2 inline-flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <Layers className="h-4 w-4 text-text-muted/90" />
              <span>首尾帧生成视频</span>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSpawnFirstFrame();
              }}
              className="nodrag -mx-2 inline-flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <Sparkles className="h-4 w-4 text-text-muted/90" />
              <span>首帧生成视频</span>
            </button>
          </div>
        </div>
      )}
      <Play className="ml-auto mr-20 h-9 w-9 text-text-muted/46" />
    </div>
  );
}
