// Copyright (c) 2026 AI anime
import { mediaNeedsCrossOrigin } from "@/shared/media/cross-origin";

export async function captureVideoFrameBlob(
  source: string,
  seekSeconds: number,
): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    if (mediaNeedsCrossOrigin(source)) video.crossOrigin = "anonymous";

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
    video.addEventListener(
      "loadeddata",
      () => {
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
          fail("invalid video duration");
          return;
        }
        const targetTime = Math.max(
          0,
          Math.min(seekSeconds, Math.max(0, duration - 0.05)),
        );
        video.addEventListener(
          "seeked",
          () => {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext("2d");
            if (!context) {
              fail("canvas context unavailable");
              return;
            }
            try {
              context.drawImage(video, 0, 0);
            } catch (error) {
              fail(error);
              return;
            }
            canvas.toBlob((blob) => {
              cleanup();
              if (blob) resolve(blob);
              else reject(new Error("canvas.toBlob returned null"));
            }, "image/png");
          },
          { once: true },
        );
        try {
          video.currentTime = targetTime;
        } catch (error) {
          fail(error);
        }
      },
      { once: true },
    );

    video.src = source;
    try {
      video.load();
    } catch {
      // The error event remains the authoritative load failure signal.
    }
  });
}
