// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState, type MouseEventHandler } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatPreciseMediaTime } from "@/components/media/media-time";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export interface PreciseAudioPlayerProps {
  ariaLabel?: string;
  className?: string;
  media?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  onLoadedDuration?(durationSeconds: number): void;
  preload?: "none" | "metadata" | "auto";
  src: string;
}

export function PreciseAudioPlayer({
  ariaLabel,
  className,
  media = false,
  onClick,
  onLoadedDuration,
  preload = "metadata",
  src,
}: PreciseAudioPlayerProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, [src]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const update = () => {
      const audio = audioRef.current;
      if (audio) setCurrentTime(audio.currentTime);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const updateDuration = (audio: HTMLAudioElement) => {
    const nextDuration = audio.duration;
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) return;
    setDuration(nextDuration);
    onLoadedDuration?.(nextDuration);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  };

  const seek = (nextTime: number) => {
    const audio = audioRef.current;
    const clamped = Math.min(duration, Math.max(0, nextTime));
    if (audio) audio.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const toggleMuted = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  };

  return (
    <div
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-[250px] items-center gap-1.5 rounded-full px-2",
        media
          ? "bg-media-foreground/10 text-media-foreground"
          : "bg-muted text-foreground",
        className,
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload={preload}
        className="hidden"
        onLoadedMetadata={(event) => updateDuration(event.currentTarget)}
        onDurationChange={(event) => updateDuration(event.currentTarget)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(duration);
        }}
      />
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        className={cn(
          "size-6 shrink-0 rounded-full",
          media && "text-media-foreground hover:bg-media-foreground/10",
        )}
        aria-label={t(
          playing ? "common.audioPlayer.pause" : "common.audioPlayer.play",
        )}
        onClick={() => void togglePlayback()}
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </Button>
      <Slider
        min={0}
        max={duration || 1}
        step={0.001}
        value={[Math.min(currentTime, duration || 0)]}
        disabled={duration <= 0}
        aria-label={t("common.audioPlayer.seek")}
        onValueChange={([value]) => seek(value ?? 0)}
        className="min-w-10 flex-1"
        trackClassName={cn(
          "h-1",
          media && "bg-media-foreground/20",
        )}
        rangeClassName={media ? "bg-media-foreground/90" : undefined}
        thumbClassName={cn(
          "size-2.5 border-0",
          media && "bg-media-foreground",
        )}
      />
      <span className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
        {formatPreciseMediaTime(currentTime, duration)} / {formatPreciseMediaTime(duration, duration)}
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        className={cn(
          "size-6 shrink-0 rounded-full",
          media && "text-media-foreground hover:bg-media-foreground/10",
        )}
        aria-label={t(
          muted ? "common.audioPlayer.unmute" : "common.audioPlayer.mute",
        )}
        onClick={toggleMuted}
      >
        {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
      </Button>
    </div>
  );
}
