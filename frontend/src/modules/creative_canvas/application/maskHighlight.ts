// Copyright (c) 2026 AI anime

export const MASK_HIGHLIGHT_RGBA = { r: 255, g: 0, b: 0, a: 153 } as const;
export const MASK_ALPHA_THRESHOLD = 8;

export function binarizeMaskToRed(
  data: Uint8ClampedArray,
  alphaThreshold: number = MASK_ALPHA_THRESHOLD,
): void {
  const { r, g, b, a } = MASK_HIGHLIGHT_RGBA;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] > alphaThreshold) {
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = a;
    } else {
      data[index + 3] = 0;
    }
  }
}

export async function buildRedHighlightMaskBlob(
  baseImage: CanvasImageSource,
  maskCanvas: HTMLCanvasElement,
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): Promise<Blob> {
  const width = maskCanvas.width;
  const height = maskCanvas.height;
  const output = createCanvas();
  output.width = width;
  output.height = height;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('mask output context unavailable');
  outputContext.drawImage(baseImage, 0, 0, width, height);

  const overlay = createCanvas();
  overlay.width = width;
  overlay.height = height;
  const overlayContext = overlay.getContext('2d');
  if (!overlayContext) throw new Error('mask overlay context unavailable');
  overlayContext.drawImage(maskCanvas, 0, 0);
  const pixels = overlayContext.getImageData(0, 0, width, height);
  binarizeMaskToRed(pixels.data);
  overlayContext.putImageData(pixels, 0, 0);
  outputContext.drawImage(overlay, 0, 0);

  return await new Promise<Blob>((resolve, reject) => {
    output.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('mask PNG encode failed'));
    }, 'image/png');
  });
}
