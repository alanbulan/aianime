// Copyright (c) 2026 AI anime
import { useSyncExternalStore } from "react";

import {
  getCanvasProjectionStatus,
  subscribeCanvasProjectionStatus,
} from "../application/canvasProjectionStatusState";
import type { FreezoneProjectionStatusItem } from "../domain/canvasProjection";

export function useCanvasProjectionStatus(
  projectionKey: string | null | undefined,
): FreezoneProjectionStatusItem | null {
  return useSyncExternalStore(
    subscribeCanvasProjectionStatus,
    () => getCanvasProjectionStatus(projectionKey),
    () => null,
  );
}
