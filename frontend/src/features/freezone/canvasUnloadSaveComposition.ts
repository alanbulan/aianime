// Copyright (c) 2026 AI anime
import {
  generateClientSaveId,
  putFreezoneCanvasKeepalive,
} from "@/features/canvas/composition";

import { createCanvasUnloadSaver } from "./application/canvasUnloadSave";
import { canvasSyncStorageGateway } from "./canvasSyncComposition";

export const saveCanvasBeforeUnload = createCanvasUnloadSaver({
  generateClientSaveId,
  persistViewport: (project, canvasId, viewport) =>
    canvasSyncStorageGateway.writeViewport(project, canvasId, viewport),
  saveCanvasKeepalive: putFreezoneCanvasKeepalive,
});
