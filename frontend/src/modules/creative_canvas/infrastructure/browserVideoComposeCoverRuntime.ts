// Copyright (c) 2026 AI anime

export function waitForVideoComposeCoverFrameReady(
  video: HTMLVideoElement,
  timeoutMs = 3000,
): Promise<void> {
  if (!video.seeking && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", check);
      video.removeEventListener("canplay", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (!video.seeking && video.readyState >= 2) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    video.addEventListener("seeked", check);
    video.addEventListener("canplay", check);
  });
}

export function captureVideoComposeCoverFrame(
  video: HTMLVideoElement,
  quality = 0.9,
): Promise<Blob | null> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(video, 0, 0, width, height);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality),
  );
}
