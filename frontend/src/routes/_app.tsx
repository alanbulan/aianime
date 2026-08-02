// Copyright (c) 2026 AI anime
import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppLayout } from "@/app/AppLayout";
import { resolveAppRouteAccess } from "@/app/commercial-access";
import { clusterConfig } from "@/lib/cluster-config";
import { getRegionCookie } from "@/lib/region-cookie";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    if (clusterConfig.mode === "multi-region" && !getRegionCookie()) {
      throw redirect({ to: "/login", replace: true });
    }
    const access = await resolveAppRouteAccess();
    if (access === "unauthenticated") {
      throw redirect({ to: "/login", replace: true });
    }
    if (access === "license-required") {
      throw redirect({ to: "/license", replace: true });
    }
  },
  component: AppLayout,
});
