// Copyright (c) 2026 AI anime
export type VideoComposeExportUrlResolver = (url: string) => string | null;

export interface VideoComposeBlobResponse {
  ok: boolean;
  status: number;
  blob: () => Promise<Blob>;
}

export type VideoComposeBlobFetcher = (
  url: string,
  init: { credentials: 'include' },
) => Promise<VideoComposeBlobResponse>;

const browserBlobFetcher: VideoComposeBlobFetcher = (url, init) =>
  fetch(url, init);

export async function fetchVideoComposeResultBlob(
  url: string,
  resolveUrl: VideoComposeExportUrlResolver,
  fetcher: VideoComposeBlobFetcher = browserBlobFetcher,
): Promise<Blob> {
  const response = await fetcher(resolveUrl(url) || url, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.blob();
}

export function resolveVideoComposeResultFileName(
  url: string,
  now: () => number = Date.now,
): string {
  return url.split('?')[0]?.split('/').pop() || `compose-${now()}.mp4`;
}

export interface VideoComposeDownloadRuntime {
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  createAnchor: () => HTMLAnchorElement;
  appendAnchor: (anchor: HTMLAnchorElement) => void;
}

const browserDownloadRuntime: VideoComposeDownloadRuntime = {
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  createAnchor: () => document.createElement('a'),
  appendAnchor: (anchor) => document.body.appendChild(anchor),
};

export function downloadVideoComposeBlob(
  blob: Blob,
  fileName: string,
  runtime: VideoComposeDownloadRuntime = browserDownloadRuntime,
): void {
  const objectUrl = runtime.createObjectUrl(blob);
  const anchor = runtime.createAnchor();
  anchor.href = objectUrl;
  anchor.download = fileName;
  runtime.appendAnchor(anchor);
  anchor.click();
  anchor.remove();
  runtime.revokeObjectUrl(objectUrl);
}
