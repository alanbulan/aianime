// Copyright (c) 2026 AI anime
import { createFileRoute, redirect } from "@tanstack/react-router";

import { CommercialLicensePage } from "@/components/commercial-license-page";
import { resolveAppRouteAccess } from "@/app/commercial-access";
import { clusterConfig } from "@/shared/platform/cluster-config";
import { getRegionCookie } from "@/lib/region-cookie";

export const Route = createFileRoute("/license")({
  beforeLoad: async () => {
    if (clusterConfig.mode === "multi-region" && !getRegionCookie()) {
      throw redirect({ to: "/login", replace: true });
    }
    const access = await resolveAppRouteAccess();
    if (access === "unauthenticated") {
      throw redirect({ to: "/login", replace: true });
    }
    if (access === "granted") {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: CommercialLicensePage,
});
