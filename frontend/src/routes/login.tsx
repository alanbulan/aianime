// Copyright (c) 2026 AI anime
import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "@/components/login-page";
import {
  ensureAuthenticatedForAppRoute,
  useAuthStore,
} from "@/modules/identity_access/public";
import { clusterConfig } from "@/lib/cluster-config";
import { getRegionCookie } from "@/lib/region-cookie";
import { authRequired } from "@/lib/runtime-config";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    // In multi-region mode, if region cookie is missing, stay on /login —
    // user must re-pick a region. Also clear the stale persisted username
    // so the picker can gate the submit button cleanly.
    if (clusterConfig.mode === "multi-region" && !getRegionCookie()) {
      useAuthStore.getState().reset();
      return;
    }

    if (!authRequired()) {
      throw redirect({ to: "/", replace: true });
    }
    if (!(await ensureAuthenticatedForAppRoute())) return; // stay on /login

    throw redirect({ to: "/", replace: true });
  },
  component: LoginPage,
});
