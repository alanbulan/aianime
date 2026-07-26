// Copyright (c) 2026 AI anime
import type { ComponentProps } from "react";

import { VideoClipPanel } from "@/features/canvas/nodes/VideoClipPanel";

type ClipPanelProps = ComponentProps<typeof VideoClipPanel>;

export type VideoNodeClipPanelProps = Omit<ClipPanelProps, "videoUrl"> & {
  visible: boolean;
  videoUrl: string | null;
  error: string | null;
  topOffsetPx: number;
};

export function VideoNodeClipPanel({
  visible,
  videoUrl,
  error,
  topOffsetPx,
  ...clipPanelProps
}: VideoNodeClipPanelProps) {
  if (!visible || !videoUrl) return null;

  return (
    <div
      className="absolute left-0 right-0 z-10 flex flex-col gap-1"
      style={{ top: `calc(100% + ${topOffsetPx}px)` }}
    >
      <VideoClipPanel videoUrl={videoUrl} {...clipPanelProps} />
      {error && (
        <div className="break-words rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive [overflow-wrap:anywhere]">
          剪辑失败：{error}
        </div>
      )}
    </div>
  );
}
