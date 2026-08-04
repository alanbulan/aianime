// Copyright (c) 2026 AI anime
import type {
  CanvasToolDialogRequest,
} from "../domain/canvasNodeTool";

export interface CanvasEventMap {
  "tool-dialog/open": CanvasToolDialogRequest;
  "tool-dialog/close": undefined;
  "upload-node/reupload": {
    nodeId: string;
  };
  "upload-node/paste-image": {
    nodeId: string;
    file: File;
  };
  "upload-node/external-file": {
    nodeId: string;
    file: File;
  };
  "video-node/reupload": {
    nodeId: string;
  };
  "video-node/external-file": {
    nodeId: string;
    file: File;
  };
  "audio-node/external-file": {
    nodeId: string;
    file: File;
  };
  "video-viewer/open": {
    videoUrl: string;
    title?: string;
  };
  "image-viewer/open": {
    imageUrl: string;
    imageList: string[];
  };
}

export interface CanvasEventBus {
  publish<TType extends keyof CanvasEventMap>(
    type: TType,
    payload: CanvasEventMap[TType],
  ): void;
  subscribe<TType extends keyof CanvasEventMap>(
    type: TType,
    handler: (payload: CanvasEventMap[TType]) => void,
  ): () => void;
}
