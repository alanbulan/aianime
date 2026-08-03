// Copyright (c) 2026 AI anime

export function directorCaptureBlobToDataUrl(
  blob: Blob,
  readErrorMessage = "无法读取导演世界截图",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error(readErrorMessage));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error(readErrorMessage));
    reader.readAsDataURL(blob);
  });
}

export function readDirectorCaptureImageSize(
  dataUrl: string,
  parseErrorMessage = "无法解析导演世界截图尺寸",
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      });
    image.onerror = () => reject(new Error(parseErrorMessage));
    image.src = dataUrl;
  });
}
