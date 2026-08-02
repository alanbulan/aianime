// Copyright (c) 2026 AI anime
import { useSyncExternalStore } from "react";
import type { FreezoneProjectionStatusItem } from "@/modules/creative_canvas/domain/canvasProjection";

import {
  getCanvasProjectionStatus,
  subscribeCanvasProjectionStatus,
} from "../application/canvasProjectionStatusState";

export function useCanvasProjectionStatus(
  projectionKey: string | null | undefined,
): FreezoneProjectionStatusItem | null {
  return useSyncExternalStore(
    subscribeCanvasProjectionStatus,
    () => getCanvasProjectionStatus(projectionKey),
    () => null,
  );
}
