// Copyright (c) 2026 AI anime
import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppLayout } from "@/app/AppLayout";
import { clusterConfig } from "@/lib/cluster-config";
import { getRegionCookie } from "@/lib/region-cookie";
import { ensureAuthenticatedForAppRoute } from "@/modules/identity_access/public";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    if (clusterConfig.mode === "multi-region" && !getRegionCookie()) {
      throw redirect({ to: "/login", replace: true });
    }
    if (!(await ensureAuthenticatedForAppRoute())) {
      throw redirect({ to: "/login", replace: true });
    }
  },
  component: AppLayout,
});
