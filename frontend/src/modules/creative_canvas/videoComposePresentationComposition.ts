// Copyright (c) 2026 AI anime
import { uploadFreezoneAsset } from './assetTransferComposition';
import {
  captureVideoComposeCoverFrame,
  waitForVideoComposeCoverFrameReady,
} from './infrastructure/browserVideoComposeCoverRuntime';
import {
  downloadVideoComposeBlob,
  fetchVideoComposeResultBlob,
  resolveVideoComposeResultFileName,
} from './infrastructure/browserVideoComposeExportRuntime';
import { probeVideoComposeMediaDuration } from './infrastructure/browserVideoComposeMediaRuntime';
import { captureBrowserVideoFrameStrip } from './infrastructure/browserVideoFrameStrip';
import { createCoverEditor } from './presentation/CoverEditor';
import { createGetFilmstrip } from './presentation/filmstrip';
import { createUseVideoComposeExportController } from './presentation/useVideoComposeExportController';
import { createUseVideoComposeTimelineSessionController } from './presentation/useVideoComposeTimelineSessionController';
import { composeCanvasVideo } from './videoComposeComposition';

export const CoverEditor = createCoverEditor({
  uploadAsset: uploadFreezoneAsset,
  captureFrame: captureVideoComposeCoverFrame,
  waitForFrame: waitForVideoComposeCoverFrameReady,
});

export const getFilmstrip = createGetFilmstrip({
  captureVideoFrameStrip: captureBrowserVideoFrameStrip,
});

export const useVideoComposeExportController =
  createUseVideoComposeExportController({
    uploadAsset: uploadFreezoneAsset,
    composeVideo: composeCanvasVideo,
    fetchResultBlob: fetchVideoComposeResultBlob,
    downloadBlob: downloadVideoComposeBlob,
    resolveResultFileName: resolveVideoComposeResultFileName,
  });

export const useVideoComposeTimelineSessionController =
  createUseVideoComposeTimelineSessionController({
    probeMediaDuration: probeVideoComposeMediaDuration,
  });
