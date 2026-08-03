// Copyright (c) 2026 AI anime
import { resolveGenerationOsInfo } from "../application/generationErrorReport";
import type { GenerationRuntimeGateway } from "../application/generationRuntime";

let runtimeDiagnosticsPromise: ReturnType<
  GenerationRuntimeGateway["getRuntimeDiagnostics"]
> | null = null;

export const browserGenerationRuntimeGateway: GenerationRuntimeGateway = {
  runtimeSessionId: `runtime-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,

  getRuntimeDiagnostics() {
    if (!runtimeDiagnosticsPromise) {
      runtimeDiagnosticsPromise = Promise.resolve().then(() => {
        const userAgent =
          typeof navigator !== "undefined"
            ? navigator.userAgent || ""
            : "";
        const osInfo = resolveGenerationOsInfo(userAgent);

        return {
          appVersion:
            typeof __APP_VERSION__ === "string"
              ? __APP_VERSION__
              : "unknown",
          osName: osInfo.osName,
          osVersion: osInfo.osVersion,
          osBuild: "unknown",
          userAgent,
        };
      });
    }

    return runtimeDiagnosticsPromise;
  },
};
