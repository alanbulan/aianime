// Copyright (c) 2026 AI anime
import type { QueryClient } from "@tanstack/react-query";

import { clearRegionCookie } from "@/lib/region-cookie";
import { tryAcquireNavLock } from "@/lib/nav-lock";
import { regionAbortController } from "@/lib/region-abort";
import {
  resetRegionState,
  resetUserSessionState,
} from "@/lib/reset-region-state";
import { configureApiRuntime } from "@/shared/api/transport";
import { useAuthStore } from "@/stores/auth-store";
import { useRegionStore } from "@/stores/region-store";

export function installApiRuntime(queryClient: QueryClient): void {
  configureApiRuntime({
    getRegionAbortSignal: () => regionAbortController().signal,
    onMissingRegion: async () => {
      if (!tryAcquireNavLock()) return;
      await useAuthStore.getState().logout().catch(() => undefined);
      resetRegionState({ queryClient });
      useRegionStore.getState().clearRegion();
      clearRegionCookie();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    },
    onUnauthorized: async () => {
      if (typeof window !== "undefined" && window.location.pathname === "/login") return;
      if (!tryAcquireNavLock()) return;
      await useAuthStore.getState().logout();
      resetUserSessionState({ queryClient });
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    },
  });
}
