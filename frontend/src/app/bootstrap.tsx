// Copyright (c) 2026 AI anime
import { config as configureZod } from "zod/v4/core";

import { AppRoot } from "@/app/AppRoot";
import { queryClient } from "@/app/query-client";
import { router } from "@/app/router";
import { setApiQueryClient } from "@/lib/api";
import { setAppRouter } from "@/lib/app-router";
import { installChunkLoadRecovery } from "@/lib/chunk-load-recovery";
import { loadClusterConfig } from "@/lib/cluster-config";
import { initDevBackendWatch } from "@/lib/dev-backend-watch";
import { installDomReconciliationGuard } from "@/lib/dom-reconciliation-guard";
import { getOrCreateReactRoot } from "@/lib/react-root";
import { loadRuntimeConfig } from "@/lib/runtime-config";
import { installVersionUpdateWatch } from "@/lib/version-update-watch";

function installApplicationRuntime() {
  // The desktop CSP forbids eval, so Zod must use its non-JIT parser.
  configureZod({ jitless: true });
  setAppRouter(router);
  setApiQueryClient(queryClient);
  installChunkLoadRecovery();
  // Translation/browser extensions may move DOM nodes before React reconciles.
  installDomReconciliationGuard();
}

export async function bootstrapApplication() {
  installApplicationRuntime();
  await Promise.all([loadClusterConfig(), loadRuntimeConfig()]);
  initDevBackendWatch();
  installVersionUpdateWatch();

  const container = document.getElementById("root");
  if (!container) throw new Error("Application root element was not found");
  getOrCreateReactRoot(container).render(<AppRoot />);
}
