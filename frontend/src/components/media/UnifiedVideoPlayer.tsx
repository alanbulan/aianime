// Copyright (c) 2026 AI anime
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatPreciseMediaTime } from "@/components/media/media-time";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type NativeVideoProps = Omit<
  ComponentPropsWithoutRef<"video">,
  | "className"
  | "controls"
  | "onDurationChange"
  | "onEnded"
  | "onLoadedMetadata"
  | "onPause"
  | "onPlay"
  | "onTimeUpdate"
  | "onVolumeChange"
>;

export interface UnifiedVideoPlayerProps extends NativeVideoProps {
  className?: string;
  compact?: boolean;
  onLoadedMetadata?: ComponentPropsWithoutRef<"video">["onLoadedMetadata"];
  videoClassName?: string;
}

export const UnifiedVideoPlayer = forwardRef<
  HTMLVideoElement,
  UnifiedVideoPlayerProps
>(function UnifiedVideoPlayer(
  {
    autoPlay = false,
    className,
    compact = false,
    muted = false,
    onClick,
    onLoadedMetadata,
    playsInline = true,
    preload = "metadata",
    src,
    videoClassName,
    ...videoProps
  },
  forwardedRef,
) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(Boolean(muted));
  const [fullscreen, setFullscreen] = useState(false);

  useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, [src]);

  useEffect(() => {
    const updateFullscreen = () => {
      setFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const update = () => {
      const video = videoRef.current;
      if (video) setCurrentTime(video.currentTime);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    try {
      await video.play();
    } catch {
      setPlaying(false);
    }
  };

  const seek = (nextTime: number) => {
    const video = videoRef.current;
    const clamped = Math.min(duration, Math.max(0, nextTime));
    if (video) video.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const changeVolume = (nextVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.min(1, Math.max(0, nextVolume));
    video.volume = clamped;
    video.muted = clamped === 0;
    setVolume(clamped);
    setIsMuted(clamped === 0);
  };

  const toggleMuted = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement === container) {
      await document.exitFullscreen?.();
      return;
    }
    await container.requestFullscreen?.();
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative overflow-hidden rounded-lg bg-media text-media-foreground",
        className,
      )}
    >
      <video
        {...videoProps}
        ref={videoRef}
        src={src}
        autoPlay={autoPlay}
        muted={muted}
        playsInline={playsInline}
        preload={preload}
        disableRemotePlayback
        className={cn(
          "block h-full w-full cursor-pointer object-contain",
          videoClassName,
        )}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) void togglePlayback();
        }}
        onDoubleClick={() => void toggleFullscreen()}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onDurationChange={(event) => {
          const nextDuration = event.currentTarget.duration;
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
        }}
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
          setVolume(event.currentTarget.volume);
          setIsMuted(event.currentTarget.muted);
          onLoadedMetadata?.(event);
        }}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setIsMuted(event.currentTarget.muted);
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(duration);
        }}
      />

      {!playing && (
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={t("common.videoPlayer.play")}
          onClick={() => void togglePlayback()}
          className="absolute left-1/2 top-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full border border-media-foreground/15 bg-media/65 text-media-foreground shadow-xl backdrop-blur hover:bg-media/80"
        >
          <Play className="ml-0.5 size-5 fill-current" />
        </Button>
      )}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-media/95 via-media/65 to-transparent px-3 pb-2 pt-8",
          compact && "px-2 pb-1.5 pt-6",
        )}
      >
        <Slider
          min={0}
          max={duration || 1}
          step={0.001}
          value={[Math.min(currentTime, duration || 0)]}
          disabled={duration <= 0}
          aria-label={t("common.videoPlayer.seek")}
          onValueChange={([value]) => seek(value ?? 0)}
          trackClassName="h-1 bg-media-foreground/20"
          rangeClassName="bg-media-foreground/90"
          thumbClassName="size-3 border-0 bg-media-foreground"
        />
        <div className="mt-1 flex min-w-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t(
              playing ? "common.videoPlayer.pause" : "common.videoPlayer.play",
            )}
            onClick={() => void togglePlayback()}
            className="text-media-foreground hover:bg-media-foreground/10"
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </Button>
          <span className="min-w-0 flex-1 truncate text-[10px] tabular-nums text-media-foreground/85">
            {formatPreciseMediaTime(currentTime, duration)} / {formatPreciseMediaTime(duration, duration)}
          </span>
          {!compact && (
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[isMuted ? 0 : volume]}
              aria-label={t("common.videoPlayer.volume")}
              onValueChange={([value]) => changeVolume(value ?? 0)}
              className="ml-auto w-16"
              trackClassName="h-1 bg-media-foreground/20"
              rangeClassName="bg-media-foreground/90"
              thumbClassName="size-2.5 border-0 bg-media-foreground"
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t(
              isMuted ? "common.videoPlayer.unmute" : "common.videoPlayer.mute",
            )}
            onClick={toggleMuted}
            className={cn(
              "text-media-foreground hover:bg-media-foreground/10",
              compact && "ml-auto",
            )}
          >
            {isMuted || volume === 0 ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t(
              fullscreen
                ? "common.videoPlayer.exitFullscreen"
                : "common.videoPlayer.fullscreen",
            )}
            onClick={() => void toggleFullscreen()}
            className="text-media-foreground hover:bg-media-foreground/10"
          >
            {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
});
