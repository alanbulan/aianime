// Copyright (c) 2026 AI anime
export interface VideoElementMetadata {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly durationMs: number;
}

export interface VideoNodePrimaryVideoProps {
  source: string | null;
  onElementChange: (element: HTMLVideoElement | null) => void;
  onSelect: () => void;
  onMetadata: (metadata: VideoElementMetadata) => void;
  onError: () => void;
}

export function VideoNodePrimaryVideo({
  source,
  onElementChange,
  onSelect,
  onMetadata,
  onError,
}: VideoNodePrimaryVideoProps) {
  return (
    <video
      ref={onElementChange}
      src={source ?? undefined}
      className="h-full w-full object-contain"
      playsInline
      preload="metadata"
      onClick={onSelect}
      onLoadedMetadata={(event) => {
        const element = event.currentTarget;
        onMetadata({
          widthPx: element.videoWidth,
          heightPx: element.videoHeight,
          durationMs: Math.round(element.duration * 1000),
        });
      }}
      onError={onError}
    />
  );
}
