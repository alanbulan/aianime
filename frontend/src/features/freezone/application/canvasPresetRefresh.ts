// Copyright (c) 2026 AI anime
import type { FreezonePresetCanvasRequest } from "@/features/freezone/domain/canvasStorage";

import { presetRequestFromMetadata } from "./canvasPreset";
import { saveErrorStatusAndBody } from "./canvasSyncCore";
import type { CanvasSyncStatus } from "./canvasSyncStorage";

export interface CanvasPresetRefreshArgs {
  project: string;
  canvasId: string;
  preset: unknown;
  revision: number | null;
  hydratedCanvasId: string | null;
  userEditsSinceHydrate: number;
  bestEffort?: boolean;
  readRevision(): number | null;
  flush(): Promise<boolean>;
  reload(): void;
  setStatus(status: CanvasSyncStatus): void;
  setError(error: string | null): void;
}

export interface CanvasPresetRefreshDependencies {
  createCanvasFromPreset(
    project: string,
    request: FreezonePresetCanvasRequest,
  ): Promise<unknown>;
}

export function createCanvasPresetRefresher(
  dependencies: CanvasPresetRefreshDependencies,
): (args: CanvasPresetRefreshArgs) => Promise<string> {
  return async (args: CanvasPresetRefreshArgs): Promise<string> => {
    const request = presetRequestFromMetadata(args.preset);
    if (!request) {
      throw new Error("当前画布不是可恢复的主线 preset");
    }
    if (
      args.bestEffort &&
      (args.revision == null || args.hydratedCanvasId !== args.canvasId)
    ) {
      return args.canvasId;
    }

    args.setStatus("saving");
    args.setError(null);
    try {
      if (!args.bestEffort || args.userEditsSinceHydrate > 0) {
        const flushed = await args.flush();
        if (!flushed) {
          if (args.bestEffort) {
            args.setError(null);
            args.setStatus("ready");
            return args.canvasId;
          }
          throw new Error("当前画布还有未保存冲突，处理后再同步主线视图");
        }
      }
      await dependencies.createCanvasFromPreset(args.project, {
        ...request,
        canvas_id: args.canvasId,
        overwrite_existing: true,
        base_revision: args.readRevision() ?? undefined,
      });
      args.reload();
      return args.canvasId;
    } catch (error) {
      const status = saveErrorStatusAndBody(error).status;
      if (args.bestEffort && (status === 409 || status === 503)) {
        args.setError(null);
        args.setStatus("ready");
        return args.canvasId;
      }
      const message =
        status === 409
          ? "主线视图已被其他窗口更新,请刷新后重试"
          : error instanceof Error
            ? error.message
            : String(error);
      args.setError(message);
      args.setStatus("error");
      throw new Error(message);
    }
  };
}
