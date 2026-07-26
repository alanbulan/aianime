// Copyright (c) 2026 AI anime
import { mediaNeedsCrossOrigin } from "../application/imageData";
import type {
  VideoFrameStripCaptureOptions,
  VideoFrameStripFrame,
} from "../application/videoFrameStrip";

export async function captureBrowserVideoFrameStrip(
  source: string,
  options: VideoFrameStripCaptureOptions,
): Promise<VideoFrameStripFrame[]> {
  return await new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    if (mediaNeedsCrossOrigin(source)) video.crossOrigin = "anonymous";

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("canvas context unavailable"));
      return;
    }

    const cleanup = () => {
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // Some browsers can throw while resetting a failed media element.
      }
    };
    const fail = (reason: unknown) => {
      cleanup();
      reject(reason instanceof Error ? reason : new Error(String(reason)));
    };

    video.addEventListener("error", () => fail("video element error"));
    video.addEventListener("loadeddata", () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        fail("invalid video duration");
        return;
      }

      const count =
        typeof options.count === "function"
          ? options.count(duration)
          : options.count;
      const ratio = video.videoHeight / Math.max(video.videoWidth, 1);
      canvas.width = options.targetWidth;
      canvas.height = Math.max(1, Math.round(options.targetWidth * ratio));

      const frames: VideoFrameStripFrame[] = [];
      let index = 0;
      const seekNext = () => {
        if (index >= count) {
          cleanup();
          resolve(frames);
          return;
        }
        const time = (duration * (index + 0.5)) / count;
        video.currentTime = Math.min(
          Math.max(time, 0),
          Math.max(0, duration - 0.05),
        );
      };

      video.addEventListener("seeked", () => {
        try {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const time = (duration * (index + 0.5)) / count;
          frames.push({
            timeMs: Math.round(time * 1000),
            url: canvas.toDataURL("image/jpeg", 0.6),
          });
        } catch (error) {
          fail(error);
          return;
        }
        index += 1;
        seekNext();
      });

      seekNext();
    });

    video.src = source;
    try {
      video.load();
    } catch {
      // The error event remains the authoritative load failure signal.
    }
  });
}
