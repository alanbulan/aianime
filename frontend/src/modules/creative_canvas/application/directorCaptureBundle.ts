// Copyright (c) 2026 AI anime

export interface DirectorCaptureUploadOptions {
  disableTimeout: boolean;
}

const DIRECTOR_CAPTURE_UPLOAD_OPTIONS = {
  disableTimeout: true,
} satisfies DirectorCaptureUploadOptions;

export type DirectorCaptureAssetUploader = (
  projectId: string,
  blob: Blob,
  filename: string,
  options: DirectorCaptureUploadOptions,
) => Promise<{ filename: string; url: string }>;

export interface DirectorCaptureFrameMeta {
  source: unknown;
}

export interface DirectorCaptureBundleInput<
  TFrameMeta extends DirectorCaptureFrameMeta = DirectorCaptureFrameMeta,
> {
  combined: Blob;
  env_only: Blob;
  frame_meta: TFrameMeta;
}

export interface DirectorCaptureControlFrameBundle<
  TFrameMeta extends DirectorCaptureFrameMeta,
> {
  schema_version: "director_control_bundle_v1";
  dir: "freezone/director-world";
  paths: Record<"combined" | "env_only" | "frame_meta", string>;
  rel_paths: Record<"combined" | "env_only" | "frame_meta", string>;
  urls: Record<"combined" | "env_only" | "frame_meta", string>;
  source: TFrameMeta["source"];
  frame_meta: TFrameMeta;
}

export async function uploadDirectorCaptureBundle<
  TFrameMeta extends DirectorCaptureFrameMeta,
>(
  projectId: string,
  nodeId: string,
  captureBundle: DirectorCaptureBundleInput<TFrameMeta>,
  uploadAsset: DirectorCaptureAssetUploader,
  now: () => number = Date.now,
): Promise<DirectorCaptureControlFrameBundle<TFrameMeta>> {
  const stamp = now();
  const [combined, envOnly, frameMeta] = await Promise.all([
    uploadAsset(
      projectId,
      captureBundle.combined,
      `director-world-${nodeId}-combined-${stamp}.png`,
      DIRECTOR_CAPTURE_UPLOAD_OPTIONS,
    ),
    uploadAsset(
      projectId,
      captureBundle.env_only,
      `director-world-${nodeId}-env-only-${stamp}.png`,
      DIRECTOR_CAPTURE_UPLOAD_OPTIONS,
    ),
    uploadAsset(
      projectId,
      new Blob([JSON.stringify(captureBundle.frame_meta)], {
        type: "application/json",
      }),
      `director-world-${nodeId}-frame-meta-${stamp}.json`,
      DIRECTOR_CAPTURE_UPLOAD_OPTIONS,
    ),
  ]);
  return {
    schema_version: "director_control_bundle_v1",
    dir: "freezone/director-world",
    paths: {
      combined: combined.filename,
      env_only: envOnly.filename,
      frame_meta: frameMeta.filename,
    },
    rel_paths: {
      combined: combined.filename,
      env_only: envOnly.filename,
      frame_meta: frameMeta.filename,
    },
    urls: {
      combined: combined.url,
      env_only: envOnly.url,
      frame_meta: frameMeta.url,
    },
    source: captureBundle.frame_meta.source,
    frame_meta: captureBundle.frame_meta,
  };
}
