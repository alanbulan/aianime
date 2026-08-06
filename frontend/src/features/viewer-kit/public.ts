// Copyright (c) 2026 AI anime
export {
  generateAiStagingProp,
  getBeatDirectorStageOverlay,
  saveBeatDirectorControlFrame,
  saveBeatDirectorStageOverlay,
} from "./three-d/composition";
export type {
  AiStagingPropResult,
  DirectorControlFrameSaveResult,
} from "./three-d/application/directorStageOperations";
export {
  FOV_MAX as PANO_FOV_MAX,
  FOV_MIN as PANO_FOV_MIN,
  PANO_DEGREES_TO_RADIANS,
  centeredPanoCropRect,
  clampPanoFov,
  fovToFocal as panoFovToFocal,
  fovToZoom as panoFovToZoom,
  normalizePanoDegrees,
  waitFrames as waitPanoFrames,
  zoomToFov as panoZoomToFov,
} from "./pano/panoCapture";
export { buildStandaloneWorldManifest } from "./three-d/directorManifest";
export type {
  DirectorControlFrameBundle,
  DirectorObjectLayer,
  DirectorStageManifest,
  DirectorStageSourceKind,
  DirectorStageSourceType,
  DirectorWorldSource,
} from "./three-d/directorManifest";
export { ThreeDDirectorDialog } from "./three-d/ThreeDDirectorDialog";
export type { ThreeDDirectorCaptureMeta } from "./three-d/ThreeDDirectorDialog";
export type { ThreeDSceneSnapshot } from "./three-d/engine/viewerApp";
export { PanoCaptureDialog } from "./pano/PanoCaptureDialog";
export type {
  PanoCaptureResult,
  PanoViewerManifest,
} from "./pano/panoManifest";
export { isImmersiveViewerActive, useViewerImmersiveBody } from "./useViewerImmersiveBody";
