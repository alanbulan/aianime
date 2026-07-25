// Copyright (c) 2026 AI anime

export interface BeatBackgroundReference {
  id: string;
  label: string;
  anchorId?: string;
  path?: string;
  relativePath?: string | null;
  url?: string | null;
}

export interface BeatBackgroundAnchorItem extends BeatBackgroundReference {
  current: boolean;
  exists: boolean;
  snapshotToSelectedBackground?: boolean;
}

export interface BeatBackgroundAnchors {
  episode: number;
  beatNumber: number;
  sceneId: string;
  canChoose: boolean;
  renderAnchorId?: string;
  currentSource?: string;
  currentAnchor: string;
  currentReference?: BeatBackgroundReference | null;
  displayReference?: BeatBackgroundReference | null;
  renderInput?: BeatBackgroundReference | null;
  anchors: BeatBackgroundAnchorItem[];
  error?: string;
}

export interface BeatBackgroundAnchorCropCommand {
  anchorId: string;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DirectorControlFrameStatus {
  episode: number;
  beatNumber: number;
  ready: boolean;
  path?: string | null;
  relativePath?: string | null;
  url?: string | null;
  scope: string;
}
