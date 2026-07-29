// Copyright (c) 2026 AI anime
import {
  browserCanvasDraftStorageGateway,
  installBrowserCanvasStorageReclaimer,
} from "./infrastructure/browserCanvasDraftStorageGateway";

export const canvasDraftStorageGateway = browserCanvasDraftStorageGateway;

export function installFreezoneCanvasStorageReclaimer(): () => void {
  return installBrowserCanvasStorageReclaimer();
}
