import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { ModelRouteAuditEntry } from "./commercial-model-proxy.js";

export function appendModelRouteAudit(
  logPath: string,
  entry: ModelRouteAuditEntry,
): void {
  void mkdir(dirname(logPath), { recursive: true })
    .then(() => appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8"))
    .catch((error) => {
      console.warn(
        "[commercial] failed to append model route audit:",
        error instanceof Error ? error.message : String(error),
      );
    });
}
